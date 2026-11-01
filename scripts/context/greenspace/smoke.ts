import { getGreenspaceSignal } from "../../../lib/context/greenspace.js";

const POSTCODES = ["SE15 4AN", "E14 9AF", "SW18 2AJ", "KT1 2TE", "NW3 1QE", "NOTAPOSTCODE"];
for (const pc of POSTCODES) {
  console.log(`--- ${pc} ---`);
  console.log(JSON.stringify(getGreenspaceSignal(pc)));
}
