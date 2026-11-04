"""Borough-level planning pipeline from the Planning London Datahub.

Same record rules as build_pipeline.py (>=1 proposed unit, decision date
present, lapsed-with-no-start dropped, sites within ~11m merged to the
largest scheme). Each site is assigned to a borough by point-in-polygon on
data/boroughs.geojson (the Datahub borough field is inconsistently named).

Output: data/context/pipeline-borough.json
  {asof, source, note, boroughs: {E09…: {approvedNotStarted, underConstruction, schemesNotStarted}}}
Usage: python3 scripts/context/pipeline/build_borough.py
"""
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
from build_pipeline import RAW, TODAY, parse_d  # noqa: E402  (shared rules)

GEO = os.path.join(ROOT, "data", "boroughs.geojson")
OUT = os.path.join(ROOT, "data", "context", "pipeline-borough.json")


def rings_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]  # MultiPolygon


def in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def load_boroughs():
    out = []
    for f in json.load(open(GEO))["features"]:
        polys = rings_of(f["geometry"])
        xs = [p[0] for poly in polys for p in poly[0]]
        ys = [p[1] for poly in polys for p in poly[0]]
        out.append((f["properties"]["code"], polys, (min(xs), min(ys), max(xs), max(ys))))
    return out


def locate(boroughs, lon, lat):
    for code, polys, (x0, y0, x1, y1) in boroughs:
        if not (x0 <= lon <= x1 and y0 <= lat <= y1):
            continue
        for poly in polys:
            if in_ring(lon, lat, poly[0]) and not any(in_ring(lon, lat, h) for h in poly[1:]):
                return code
    return None


def main():
    recs = []
    with open(RAW) as f:
        for line in f:
            r = json.loads(line)
            try:
                units = int(r.get("units") or 0)
            except (TypeError, ValueError):
                units = 0
            if units < 1 or parse_d(r.get("dec")) is None:
                continue
            try:
                lat, lon = float(r.get("lat")), float(r.get("lon"))
            except (TypeError, ValueError):
                continue
            comm, comp, laps = parse_d(r.get("comm")), parse_d(r.get("comp")), parse_d(r.get("laps"))
            if comp is not None:
                status = "completed"
            elif comm is not None:
                status = "started"
            elif laps is not None and laps < TODAY:
                continue
            else:
                status = "not_started"
            recs.append({"units": units, "status": status, "dec": r.get("dec") or "",
                         "lat": lat, "lon": lon})

    cells = defaultdict(list)
    for r in recs:
        cells[(round(r["lat"], 4), round(r["lon"], 4))].append(r)
    sites = []
    for members in cells.values():
        members.sort(key=lambda r: (-r["units"], r["dec"]))
        sites.append(members[0])

    boroughs = load_boroughs()
    agg = {code: {"approvedNotStarted": 0, "underConstruction": 0, "schemesNotStarted": 0}
           for code, _, _ in boroughs}
    unplaced = 0
    for s in sites:
        if s["status"] == "completed":
            continue
        code = locate(boroughs, s["lon"], s["lat"])
        if code is None:
            unplaced += 1
            continue
        if s["status"] == "not_started":
            agg[code]["approvedNotStarted"] += s["units"]
            agg[code]["schemesNotStarted"] += 1
        else:
            agg[code]["underConstruction"] += s["units"]

    out = {
        "asof": "2026-11-01",
        "source": "Planning London Datahub guest API (planningdata.london.gov.uk), approved decisions "
                  "2015-01-01..2026-09-30 with >=1 proposed residential unit",
        "note": "Units on approved sites. Sites within ~11m merged to the largest scheme; lapsed-with-no-start "
                "dropped; completed excluded. Borough by point-in-polygon. Planning-database counts, not MHCLG "
                f"starts/completions. Active sites outside the 33 boroughs: {unplaced}.",
        "boroughs": agg,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    tot_ns = sum(v["approvedNotStarted"] for v in agg.values())
    tot_uc = sum(v["underConstruction"] for v in agg.values())
    print(f"sites={len(sites)} unplaced_active={unplaced} approvedNotStarted={tot_ns} underConstruction={tot_uc}")


if __name__ == "__main__":
    main()
