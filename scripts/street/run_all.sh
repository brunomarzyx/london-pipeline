#!/bin/bash
# Build data/street.db end to end: 01 Price Paid → 02 postcodes → 04/05 EPC floor areas →
# 03 aggregate → 06 neighbourhood context (IMD, PTAL, crime) → tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
python3 scripts/street/01_ppd.py
python3 scripts/street/02_postcodes.py
python3 scripts/street/04_epc_fetch.py          # skips years already fetched
python3 scripts/street/05_epc_join.py
python3 scripts/street/03_aggregate.py
python3 scripts/street/06_context.py            # needs data/context/{imd2025_file1.xlsx,ptal_lsoa2011.csv}
python3 scripts/street/test_aggregate.py
python3 scripts/street/test_context.py
