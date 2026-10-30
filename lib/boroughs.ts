// Canonical ONS codes for the 33 London boroughs.
const BOROUGH_CODES: Record<string, string> = {
  "city of london": "E09000001",
  "barking and dagenham": "E09000002",
  barnet: "E09000003",
  bexley: "E09000004",
  brent: "E09000005",
  bromley: "E09000006",
  camden: "E09000007",
  croydon: "E09000008",
  ealing: "E09000009",
  enfield: "E09000010",
  greenwich: "E09000011",
  hackney: "E09000012",
  "hammersmith and fulham": "E09000013",
  haringey: "E09000014",
  harrow: "E09000015",
  havering: "E09000016",
  hillingdon: "E09000017",
  hounslow: "E09000018",
  islington: "E09000019",
  "kensington and chelsea": "E09000020",
  "kingston upon thames": "E09000021",
  lambeth: "E09000022",
  lewisham: "E09000023",
  merton: "E09000024",
  newham: "E09000025",
  redbridge: "E09000026",
  "richmond upon thames": "E09000027",
  southwark: "E09000028",
  sutton: "E09000029",
  "tower hamlets": "E09000030",
  "waltham forest": "E09000031",
  wandsworth: "E09000032",
  "city of westminster": "E09000033",
  westminster: "E09000033",
};

/** Normalise a borough name to its ONS code; null when unknown. */
export function normaliseBoroughCode(name: string | null): string | null {
  if (!name) return null;
  const key = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return BOROUGH_CODES[key] ?? null;
}
