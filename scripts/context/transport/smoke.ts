import { getTransportSignal } from "../../../lib/context/transport.js";

const POSTCODES = ["SE15 4AN", "E14 9AF", "SW18 2AJ", "KT1 2TE", "NW3 1QE", "NOTAPOSTCODE"];
for (const pc of POSTCODES) {
  console.log(`--- ${pc} ---`);
  for (const s of getTransportSignal(pc)) console.log(JSON.stringify(s));
}
