import { getEpcSignal } from "../../../lib/context/epc";

const pcs = ["SE15 4AN", "E14 9AF", "SW18 2AJ", "KT1 2TE", "NW3 1QE", "not a postcode"];
for (const pc of pcs) {
  const s = getEpcSignal(pc);
  console.log(`--- ${pc} ---`);
  console.log(JSON.stringify(s, null, 1));
}
