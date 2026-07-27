// Confirms data/pubs-gb.json has no lingering OSM node/way duplicates.
// dedupeRows() is idempotent on already-clean data, so if applying it
// changes the row count, something shipped undeduped (a stale
// regeneration, a manual edit, whatever). Run in CI on every push as a
// data-integrity check, the same way typecheck guards app.js -- this is
// the same class of bug that let duplicate pins reach the Map tab before
// dedup moved into the build script.

import fs from "node:fs/promises";
import { dedupeRows } from "./lib/dedupe.mjs";

const raw = await fs.readFile(new URL("../data/pubs-gb.json", import.meta.url), "utf8");
const rows = JSON.parse(raw);

const deduped = dedupeRows(rows);

if (deduped.length === rows.length) {
  console.log(`OK: all ${rows.length} pubs in data/pubs-gb.json are already deduplicated.`);
  process.exit(0);
}

console.error(
  `data/pubs-gb.json has ${rows.length - deduped.length} duplicate row(s) that dedupeRows() would collapse ` +
    `(${rows.length} rows, ${deduped.length} after deduping). Re-run build-pubs-data.mjs to regenerate it.`
);
process.exit(1);
