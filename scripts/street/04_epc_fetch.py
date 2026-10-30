"""Stream the MHCLG domestic EPC full load (8.3 GB zip) and keep London rows only -> data/street/epc/epc_<year>.parquet.

Source: get-energy-performance-data.communities.gov.uk (OGL, bearer token in .env as EPC_TOKEN).
The zip is never written to disk: each yearly member is read with one HTTP range request and
inflated on the fly, so disk use is only the London extract (~ a few hundred MB).
Usage: python3 scripts/street/04_epc_fetch.py [year ...]   (default: all certificate years not yet fetched)
"""
import csv, io, os, struct, sys, time, zlib
from concurrent.futures import ProcessPoolExecutor
import requests
import pyarrow as pa, pyarrow.parquet as pq
from remotezip import RemoteZip

API = "https://api.get-energy-performance-data.communities.gov.uk/api/files/domestic/csv"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "street", "epc")
LONDON_PREFIX = "E09"  # London borough LAD codes E09000001-E09000033
KEEP = ["certificate_number", "uprn", "address1", "address2", "address", "postcode", "local_authority",
        "property_type", "built_form", "total_floor_area", "number_habitable_rooms", "current_energy_rating",
        "construction_age_band", "tenure", "lodgement_date", "report_type"]
csv.field_size_limit(10**8)


def token():
    if "EPC_TOKEN" not in os.environ:
        for line in open(os.path.join(ROOT, ".env")):
            if line.startswith("EPC_TOKEN="):
                os.environ["EPC_TOKEN"] = line.split("=", 1)[1].strip()
    return os.environ["EPC_TOKEN"]


def signed_url():
    r = requests.get(API, headers={"Authorization": f"Bearer {token()}"}, allow_redirects=False, timeout=30)
    r.raise_for_status()
    return r.headers["location"]  # pre-signed S3 URL, valid ~30 s to START a request


class Inflate(io.RawIOBase):
    """File-like view of a raw-deflate stream coming from an HTTP response."""
    def __init__(self, chunks):
        self.chunks, self.d, self.buf = chunks, zlib.decompressobj(-15), b""
    def readable(self):
        return True
    def readinto(self, b):
        while not self.buf:
            try:
                c = next(self.chunks)
            except StopIteration:
                self.buf = self.d.flush()
                if not self.buf:
                    return 0
                break
            self.buf = self.d.decompress(c)
        n = min(len(b), len(self.buf))
        b[:n], self.buf = self.buf[:n], self.buf[n:]
        return n


def fetch(member):
    name, off, csize = member
    year = name.split("-")[1].split(".")[0]
    dest = os.path.join(OUT, f"epc_{year}.parquet")
    t0 = time.time()
    for attempt in range(3):
        try:
            r = requests.get(signed_url(), headers={"Range": f"bytes={off}-{off + 30 + 65535 * 2 + csize}"},
                             stream=True, timeout=120)
            r.raise_for_status()
            it = r.iter_content(1 << 20)
            head = b""
            while len(head) < 30:
                head += next(it)
            n, e = struct.unpack("<HH", head[26:30])
            while len(head) < 30 + n + e:
                head += next(it)
            first = head[30 + n + e:]
            chunks = iter([first] + [c for c in []])
            def gen():
                yield first
                yield from it
            text = io.TextIOWrapper(io.BufferedReader(Inflate(gen()), 1 << 20), encoding="utf-8", errors="replace", newline="")
            rd = csv.reader(text)
            hdr = next(rd)
            ix = [hdr.index(k) for k in KEEP]
            la = hdr.index("local_authority")
            cols = {k: [] for k in KEEP}
            seen = 0
            for row in rd:
                seen += 1
                if len(row) > la and row[la].startswith(LONDON_PREFIX):
                    for k, i in zip(KEEP, ix):
                        cols[k].append(row[i] if i < len(row) else "")
            pq.write_table(pa.table(cols), dest + ".tmp", compression="zstd")
            os.replace(dest + ".tmp", dest)
            return f"{year}: {len(cols['uprn'])} London of {seen} rows in {time.time() - t0:.0f}s"
        except Exception as ex:  # transient network / expiry: retry with a fresh URL
            err = repr(ex)
            time.sleep(5)
    return f"{year}: FAILED {err}"


def main():
    os.makedirs(OUT, exist_ok=True)
    with RemoteZip(signed_url()) as z:
        members = [(i.filename, i.header_offset, i.compress_size) for i in z.infolist()
                   if i.filename.startswith("certificates-")]
    want = set(sys.argv[1:])
    todo = [m for m in members if (not want or m[0].split("-")[1][:4] in want)
            and not os.path.exists(os.path.join(OUT, f"epc_{m[0].split('-')[1][:4]}.parquet"))]
    todo.sort(key=lambda m: -m[2])  # biggest first
    print(f"{len(todo)} yearly files to fetch", flush=True)
    with ProcessPoolExecutor(4) as ex:
        for msg in ex.map(fetch, todo):
            print(msg, flush=True)
    print("EPC_FETCH_DONE", flush=True)


if __name__ == "__main__":
    main()
