// Server-only access to data/global.json (BIS snapshot, 30 Oct 2026).
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  cityMetrics,
  findCityDoc,
  type CityMetrics,
  type GlobalCityDoc,
} from "./global";

let cache: GlobalCityDoc[] | null = null;

export function loadGlobalCities(): GlobalCityDoc[] {
  if (!cache) {
    const raw = readFileSync(path.join(process.cwd(), "data", "global.json"), "utf8");
    cache = (JSON.parse(raw) as { cities: GlobalCityDoc[] }).cities;
  }
  return cache;
}

export function listCityMetrics(): CityMetrics[] {
  return loadGlobalCities().map(cityMetrics);
}

export function getCityMetrics(key: string): CityMetrics | null {
  const found = findCityDoc(loadGlobalCities(), key);
  return found ? cityMetrics(found) : null;
}
