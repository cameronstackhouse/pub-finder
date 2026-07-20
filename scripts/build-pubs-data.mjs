// Converts a GeoJSON extract of Great Britain amenity=pub features (produced
// in CI from a Geofabrik OSM extract via osmium-tool) into the compact
// static dataset served by the app at data/pubs-gb.json.
//
// Usage: node scripts/build-pubs-data.mjs <path-to-pubs.geojson>

import fs from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-pubs-data.mjs <path-to-pubs.geojson>");
  process.exit(1);
}

function formatAddress(tags) {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

// GeoJSON coordinates are [lon, lat]. Ways/relations may come through as
// LineString/Polygon/MultiPolygon; approximate their centroid by averaging
// all ring/line points, which is more than accurate enough for a pub marker.
function centroidOf(geometry) {
  const points = [];

  const collect = (coords, depth) => {
    if (depth === 0) {
      points.push(coords);
      return;
    }
    for (const c of coords) collect(c, depth - 1);
  };

  const depthByType = {
    Point: 0,
    LineString: 1,
    MultiPoint: 1,
    Polygon: 2,
    MultiLineString: 2,
    MultiPolygon: 3,
  };

  const depth = depthByType[geometry.type];
  if (depth == null) return null;
  collect(geometry.coordinates, depth);
  if (points.length === 0) return null;

  const [sumLon, sumLat] = points.reduce(
    ([lonAcc, latAcc], [lon, lat]) => [lonAcc + lon, latAcc + lat],
    [0, 0]
  );
  return [sumLon / points.length, sumLat / points.length];
}

const raw = await fs.readFile(inputPath, "utf8");
const geojson = JSON.parse(raw);

const seen = new Set();
const rows = [];

for (const feature of geojson.features || []) {
  const tags = feature.properties || {};
  if (!feature.geometry) continue;

  const centroid =
    feature.geometry.type === "Point" ? feature.geometry.coordinates : centroidOf(feature.geometry);
  if (!centroid) continue;

  const [lon, lat] = centroid;
  if (typeof lat !== "number" || typeof lon !== "number") continue;

  const name = tags.name || "Unnamed pub";
  const roundedLat = Math.round(lat * 1e5) / 1e5;
  const roundedLon = Math.round(lon * 1e5) / 1e5;

  const key = `${name}|${roundedLat}|${roundedLon}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const operator = tags.operator || tags.brand || "";
  const website = tags.website || tags["contact:website"] || "";
  const phone = tags.phone || tags["contact:phone"] || "";
  const openingHours = tags.opening_hours || "";
  const wikipedia = tags.wikipedia || "";

  rows.push([
    name,
    roundedLat,
    roundedLon,
    formatAddress(tags),
    operator,
    website,
    phone,
    openingHours,
    wikipedia,
  ]);
}

rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);

await fs.mkdir(new URL("../data", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../data/pubs-gb.json", import.meta.url), JSON.stringify(rows));

console.log(`Wrote ${rows.length} pubs to data/pubs-gb.json`);
