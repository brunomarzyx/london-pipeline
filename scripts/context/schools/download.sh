#!/bin/bash
# Download DfE GIAS all-establishments extract (newest available) + Ofsted MI.
# GIAS pattern: edubasealldataYYYYMMDD.csv — try today, step back day by day.
set -u
DIR="$(dirname "$0")"
RAW="data/raw/schools"
mkdir -p "$RAW"
LOG="logs/schools.log"
mkdir -p logs

fetch_gias() {
  local d="$1"
  local url="https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${d}.csv"
  local out="$RAW/edubasealldata${d}.csv"
  # Skip re-download if file looks full (>50MB).
  if [ -f "$out" ] && [ "$(wc -c < "$out")" -gt 50000000 ]; then
    echo "GIAS $d already present, skipping" | tee -a "$LOG"
    return 0
  fi
  echo "Trying GIAS $d ..." | tee -a "$LOG"
  if curl -s --max-time 300 -o "$out" -w "%{http_code} %{size_download}\n" "$url" | tee -a "$LOG"; then
    local rows
    rows=$(python3 -c "import csv;print(sum(1 for _ in open('$out',encoding='cp1252'))-1)" 2>/dev/null || echo 0)
    echo "GIAS $d rows=$rows" | tee -a "$LOG"
    # Full extract has ~52k rows incl. academies; reject partial extracts (<45k rows).
    if [ "$rows" -gt 45000 ]; then
      echo "GIAS $d ACCEPTED ($rows rows)" | tee -a "$LOG"
      return 0
    fi
    echo "GIAS $d looks partial ($rows rows), trying earlier date" | tee -a "$LOG"
    rm -f "$out"
    return 1
  fi
  return 1
}

# Attempt 1: today, then step back day by day (GNU/BSD date compatible loop via python).
for d in $(python3 -c "
from datetime import date,timedelta
t=date(2026,11,1)
for i in range(12): print((t-timedelta(days=i)).strftime('%Y%m%d'))"); do
  if fetch_gias "$d"; then break; fi
done

# Ofsted state-funded schools MI, latest inspections (pinned file, Sep 2026).
OFSTED_URL="https://assets.publishing.service.gov.uk/media/6ad095a72de3184ccf8b818d/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Sep_2026.csv"
if [ ! -f "$RAW/ofsted_latest_2026-09-30.csv" ]; then
  echo "Downloading Ofsted MI ..." | tee -a "$LOG"
  curl -s --max-time 300 -o "$RAW/ofsted_latest_2026-09-30.csv" -w "%{http_code} %{size_download}\n" "$OFSTED_URL" | tee -a "$LOG"
fi
echo "download step done" | tee -a "$LOG"
