// Fetches every OSM node/way tagged amenity=pub in Great Britain via the
// Overpass API and writes a compact static dataset to data/pubs-gb.json.
// Run from CI (GitHub Actions), not from the deployed app: this is a
// periodic offline build step, not a per-request API call.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const QUERY = `
  [out:json][timeout:180][maxsize:1073741824];
  area["ISO3166-1"="GB"][admin_level=2]->.gb;
  (
    node["amenity"="pub"](area.gb);
    way["amenity"="pub"](area.gb);
  );
  out center tags;
`;

function formatAddress(tags) {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

async function fetchFromAnyEndpoint() {
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Querying ${endpoint}...`);
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(QUERY),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Endpoint failed: ${endpoint} (${err.message})`);
      lastErr = err;
    }
  }
  throw lastErr;
}

const data = await fetchFromAnyEndpoint();

const seen = new Set();
const rows = [];

for (const el of data.elements || []) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;

  const tags = el.tags || {};
  const name = tags.name || "Unnamed pub";
  const roundedLat = Math.round(lat * 1e5) / 1e5;
  const roundedLon = Math.round(lon * 1e5) / 1e5;

  const key = `${name}|${roundedLat}|${roundedLon}`;
  if (seen.has(key)) continue;
  seen.add(key);

  rows.push([name, roundedLat, roundedLon, formatAddress(tags)]);
}

rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);

const fs = await import("node:fs/promises");
await fs.mkdir(new URL("../data", import.meta.url), { recursive: true });
await fs.writeFile(
  new URL("../data/pubs-gb.json", import.meta.url),
  JSON.stringify(rows)
);

console.log(`Wrote ${rows.length} pubs to data/pubs-gb.json`);
