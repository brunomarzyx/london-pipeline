import { getAirSignal } from "../../../lib/context/air";

const postcodes = ["SE15 4AN", "E14 9AF", "SW18 2AJ", "KT1 2TE", "NW3 1QE", "NOTAPOSTCODE"];
for (const pc of postcodes) {
  console.log(JSON.stringify(getAirSignal(pc)));
}
