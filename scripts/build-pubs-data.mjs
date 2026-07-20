// Converts a GeoJSON extract of Great Britain amenity=pub features (produced
// in CI from a Geofabrik OSM extract via osmium-tool) into the compact
// static dataset served by the app at data/pubs-gb.json. Optionally also
// takes a GeoJSON extract of natural=coastline ways from the same source,
// used to flag pubs within NEAR_SEA_THRESHOLD_MILES of the coast.
//
// Usage: node scripts/build-pubs-data.mjs <path-to-pubs.geojson> [path-to-coastline.geojson]

import fs from "node:fs/promises";

const inputPath = process.argv[2];
const coastlinePath = process.argv[3];
if (!inputPath) {
  console.error("Usage: node scripts/build-pubs-data.mjs <path-to-pubs.geojson> [path-to-coastline.geojson]");
  process.exit(1);
}

const NEAR_SEA_THRESHOLD_MILES = 0.2;
const MILES_PER_LAT_DEGREE = 69.0;
const MILES_PER_LON_DEGREE_AT_EQUATOR = 69.17;
const COASTLINE_GRID_CELL_DEGREES = 0.02; // ~1.3-1.5 miles across GB's latitude range
const MAX_SEARCH_RING = 3; // cells outward; well beyond the 0.2mi threshold given the cell size above

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

// --- Coastline proximity -----------------------------------------------
//
// At a 0.2 mile threshold we need distance to the nearest point *on* the
// coastline, not just to the nearest OSM vertex -- vertices can be spaced
// further apart than that on straight stretches, which would wrongly miss
// pubs sitting right on the coast between two distant vertices.
//
// GB's coastline (particularly Scotland's islands and inlets) has far too
// many segments to check every pub against every segment directly, so
// segments are bucketed into a uniform grid keyed by their bounding box,
// and each pub only checks the handful of cells around its own location.

function extractCoastlineSegments(geojson) {
  const segments = [];
  for (const feature of geojson.features || []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const lines =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.type === "MultiLineString"
          ? geometry.coordinates
          : [];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lon1, lat1] = line[i];
        const [lon2, lat2] = line[i + 1];
        segments.push({ lon1, lat1, lon2, lat2 });
      }
    }
  }
  return segments;
}

function buildCoastlineGrid(segments) {
  const grid = new Map();
  const cellIndexOf = (deg) => Math.floor(deg / COASTLINE_GRID_CELL_DEGREES);

  for (const seg of segments) {
    const minCx = cellIndexOf(Math.min(seg.lon1, seg.lon2));
    const maxCx = cellIndexOf(Math.max(seg.lon1, seg.lon2));
    const minCy = cellIndexOf(Math.min(seg.lat1, seg.lat2));
    const maxCy = cellIndexOf(Math.max(seg.lat1, seg.lat2));

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx}:${cy}`;
        let cell = grid.get(key);
        if (!cell) {
          cell = [];
          grid.set(key, cell);
        }
        cell.push(seg);
      }
    }
  }

  return grid;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function isNearSea(grid, lon, lat) {
  const cellIndexOf = (deg) => Math.floor(deg / COASTLINE_GRID_CELL_DEGREES);
  const cx = cellIndexOf(lon);
  const cy = cellIndexOf(lat);

  // Local equirectangular projection centred on this pub -- accurate at
  // sub-mile scale and avoids the ~25% longitude-distance distortion a
  // single fixed scale would introduce across GB's latitude range.
  const milesPerLonDegree = MILES_PER_LON_DEGREE_AT_EQUATOR * Math.cos((lat * Math.PI) / 180);

  for (let ring = 0; ring <= MAX_SEARCH_RING; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // only this ring's outer cells
        const cell = grid.get(`${cx + dx}:${cy + dy}`);
        if (!cell) continue;

        for (const seg of cell) {
          const x1 = (seg.lon1 - lon) * milesPerLonDegree;
          const y1 = (seg.lat1 - lat) * MILES_PER_LAT_DEGREE;
          const x2 = (seg.lon2 - lon) * milesPerLonDegree;
          const y2 = (seg.lat2 - lat) * MILES_PER_LAT_DEGREE;
          if (pointToSegmentDistance(0, 0, x1, y1, x2, y2) <= NEAR_SEA_THRESHOLD_MILES) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

let coastlineGrid = null;
if (coastlinePath) {
  const coastlineRaw = await fs.readFile(coastlinePath, "utf8");
  const coastlineGeojson = JSON.parse(coastlineRaw);
  const segments = extractCoastlineSegments(coastlineGeojson);
  coastlineGrid = buildCoastlineGrid(segments);
  console.log(`Loaded ${segments.length} coastline segments`);
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

  // Pubs with no name tag are dropped rather than kept as "Unnamed pub"
  // placeholders: they're useless for "find me a pub" (nothing to tell the
  // user to look for), and in practice they're overwhelmingly low-quality
  // OSM entries -- only ~6% have a usable address either, versus ~81% of
  // named pubs, and some carry obviously wrong tags (e.g. operator=Royal Mail).
  const name = tags.name;
  if (!name) continue;

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

  // Kept as compact "1"/"" flags rather than raw tag values -- the app only
  // ever needs "does this pub have it", not the full range of tag values.
  const beerGarden = tags.beer_garden === "yes" || tags.outdoor_seating === "yes" ? "1" : "";
  const dogFriendly = tags.dog === "yes" || tags.dog === "leashed" ? "1" : "";
  const foodServed = tags.food === "yes" ? "1" : "";
  const realAle = tags.real_ale === "yes" ? "1" : "";
  const darts = tags.darts === "yes" ? "1" : "";
  const pool = tags.pool === "yes" ? "1" : "";

  // wheelchair keeps its raw value (yes/limited/no) since all three are
  // meaningful to show, unlike the plain presence/absence flags above.
  const wheelchair = ["yes", "limited", "no"].includes(tags.wheelchair) ? tags.wheelchair : "";

  // Payment: cash accepted is a simple flag, but card acceptance needs two
  // separate flags (an explicit "yes" vs an explicit "no") so the app can
  // tell "known to accept cards", "known NOT to accept any card", and
  // "we simply don't know" apart -- claiming "cash only" just because card
  // tags are untagged would be a guess, not a fact.
  const paymentCash = tags["payment:cash"] === "yes" ? "1" : "";
  const cardTagValues = [tags["payment:credit_cards"], tags["payment:debit_cards"], tags["payment:contactless"]];
  const paymentCardYes = cardTagValues.some((v) => v === "yes") ? "1" : "";
  const paymentCardNo = !paymentCardYes && cardTagValues.some((v) => v === "no") ? "1" : "";

  const description = (tags.description || "").trim().slice(0, 300);
  const image = /^https?:\/\//i.test(tags.image || "") ? tags.image : "";
  const listedStatus = tags.listed_status || "";
  const startDate = tags.start_date || "";

  const nearSea = coastlineGrid && isNearSea(coastlineGrid, lon, lat) ? "1" : "";

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
    beerGarden,
    dogFriendly,
    foodServed,
    wheelchair,
    realAle,
    paymentCash,
    paymentCardYes,
    paymentCardNo,
    description,
    image,
    listedStatus,
    startDate,
    darts,
    pool,
    nearSea,
  ]);
}

rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);

await fs.mkdir(new URL("../data", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../data/pubs-gb.json", import.meta.url), JSON.stringify(rows));

// A small companion file the app fetches to show "data last updated" --
// keeping this honest and automatic (regenerated every time this script
// runs) beats hardcoding a date that silently goes stale.
await fs.writeFile(
  new URL("../data/pubs-meta.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), pubCount: rows.length })
);

console.log(`Wrote ${rows.length} pubs to data/pubs-gb.json`);
if (coastlineGrid) {
  const nearSeaCount = rows.filter((r) => r[23] === "1").length;
  console.log(`${nearSeaCount} pubs (${((100 * nearSeaCount) / rows.length).toFixed(1)}%) within ${NEAR_SEA_THRESHOLD_MILES}mi of the coast`);
}
