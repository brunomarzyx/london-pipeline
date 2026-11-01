import { getSchoolsSignal } from "../../../lib/context/schools.js";

const POSTCODES = ["SE15 4AN", "E14 9AF", "SW18 2AJ", "KT1 2TE", "NW3 1QE", "NOTAPOSTCODE"];
for (const pc of POSTCODES) {
  const s = getSchoolsSignal(pc);
  console.log(`--- ${pc} ---`);
  console.log(JSON.stringify(s, null, 1));
}
