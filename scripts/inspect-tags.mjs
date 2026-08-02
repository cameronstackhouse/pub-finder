// Reports what tags actually exist on GB pubs in an OSM extract, and how
// often, so feature decisions are made against real coverage instead of
// assumptions about what OSM "should" contain.
//
// Written after brewery=* turned out to be tagged on only ~2% of pubs --
// worth measuring before building anything else on a given tag.
//
// Usage: node scripts/inspect-tags.mjs <path-to-pubs.geojson> [key-substring ...]
//
// Prints: total pubs, the most common tag keys overall, then for every key
// matching the substrings given (default: drink-related ones) the tag's
// coverage and its most common values.

import fs from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/inspect-tags.mjs <path-to-pubs.geojson> [key-substring ...]");
  process.exit(1);
}

const DEFAULT_PATTERNS = ["drink", "beer", "brewery", "brewing", "ale", "cask", "keg", "tap", "cider", "stout", "lager", "guinness", "menu", "brand"];
const patterns = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_PATTERNS;

const TOP_KEYS_TO_SHOW = 40;
const TOP_VALUES_TO_SHOW = 25;

const raw = await fs.readFile(inputPath, "utf8");
const geojson = JSON.parse(raw);

/** @type {Map<string, number>} */
const keyCounts = new Map();
/** @type {Map<string, Map<string, number>>} */
const valueCounts = new Map();

let total = 0;
let named = 0;

for (const feature of geojson.features || []) {
  const tags = feature.properties || {};
  if (!tags.name) continue; // match build-pubs-data.mjs, which drops unnamed pubs
  total++;
  named++;

  for (const [key, value] of Object.entries(tags)) {
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);

    const lower = key.toLowerCase();
    if (!patterns.some((p) => lower.includes(p))) continue;
    let values = valueCounts.get(key);
    if (!values) {
      values = new Map();
      valueCounts.set(key, values);
    }
    values.set(value, (values.get(value) || 0) + 1);
  }
}

const pct = (n) => `${((100 * n) / total).toFixed(2)}%`;
const byCountDesc = (a, b) => b[1] - a[1];

console.log(`Named pubs in extract: ${named}\n`);

console.log(`=== ${TOP_KEYS_TO_SHOW} most common tag keys ===`);
for (const [key, count] of [...keyCounts].sort(byCountDesc).slice(0, TOP_KEYS_TO_SHOW)) {
  console.log(`  ${String(count).padStart(6)}  ${pct(count).padStart(7)}  ${key}`);
}

console.log(`\n=== keys matching: ${patterns.join(", ")} ===`);
const matching = [...valueCounts.keys()].sort((a, b) => (keyCounts.get(b) || 0) - (keyCounts.get(a) || 0));
if (matching.length === 0) {
  console.log("  (none)");
}
for (const key of matching) {
  const count = keyCounts.get(key) || 0;
  console.log(`\n  ${key} -- ${count} pubs (${pct(count)})`);
  const values = [...(valueCounts.get(key) || new Map())].sort(byCountDesc);
  for (const [value, n] of values.slice(0, TOP_VALUES_TO_SHOW)) {
    console.log(`      ${String(n).padStart(5)}  ${JSON.stringify(value).slice(0, 90)}`);
  }
  if (values.length > TOP_VALUES_TO_SHOW) {
    console.log(`      ... and ${values.length - TOP_VALUES_TO_SHOW} more distinct values`);
  }
}

// A pub is only useful for a "what pints are on" feature if it names
// specific drinks, so count how many do by any of the plausible routes.
const namesSpecificDrinks = (geojson.features || []).filter((f) => {
  const tags = f.properties || {};
  if (!tags.name) return false;
  return Object.keys(tags).some((k) => k.toLowerCase().startsWith("drink:") && k.toLowerCase() !== "drink:beer");
}).length;
console.log(`\n=== bottom line ===`);
console.log(`Pubs naming at least one specific drink via drink:<name>: ${namesSpecificDrinks} (${pct(namesSpecificDrinks)})`);
