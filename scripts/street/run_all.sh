#!/bin/bash
# Build data/street.db end to end: 01 (Price Paid London extract) →
# 02 (postcode lookup) → 03 (aggregate) → tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
python3 scripts/street/01_ppd.py
python3 scripts/street/02_postcodes.py
python3 scripts/street/03_aggregate.py
python3 scripts/street/test_aggregate.py
