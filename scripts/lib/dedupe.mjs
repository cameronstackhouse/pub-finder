// Shared OSM node/way duplicate-collapsing logic, used by both
// build-pubs-data.mjs (to dedupe before writing data/pubs-gb.json) and
// verify-no-duplicate-pubs.mjs (to confirm the shipped file stays deduped).
// Operates on the same positional row-array format the dataset ships in.
//
// The same physical pub sometimes appears twice in OSM (e.g. a node and a
// way both tagged amenity=pub for the same building), a few metres apart
// and often with one copy missing fields the other has. This used to be
// handled client-side in app.js on every search/crawl/map load; moved here
// so the shipped dataset is clean by construction instead of relying on
// every consumer remembering to dedupe (a new one -- the Map tab -- didn't,
// which is what prompted this move).

export const DEDUPE_DISTANCE_MILES = 0.05; // ~80m

/**
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Row indexes for every field beyond name/lat/lon worth counting towards
// "which duplicate has more complete data". There's no search origin to
// break ties by at build time (unlike the old client-side version of this
// logic, which preferred whichever copy was closer to wherever the user
// was searching from), so data completeness is the best available signal.
const COMPLETENESS_INDEXES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

/** @param {Array} row */
function completenessScore(row) {
  return COMPLETENESS_INDEXES.reduce((score, i) => score + (row[i] ? 1 : 0), 0);
}

/** @param {Array[]} cluster */
function pickBestOfCluster(cluster) {
  if (cluster.length === 1) return cluster[0];
  return cluster.slice().sort((a, b) => completenessScore(b) - completenessScore(a))[0];
}

/**
 * @param {Array[]} rows Positional pub rows: [name, lat, lon, address, ...].
 * @returns {Array[]}
 */
export function dedupeRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[0].trim().toLowerCase();
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const deduped = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const clusters = [];
    for (const row of group) {
      const cluster = clusters.find((c) => haversineMiles(c[0][1], c[0][2], row[1], row[2]) <= DEDUPE_DISTANCE_MILES);
      if (cluster) cluster.push(row);
      else clusters.push([row]);
    }
    for (const cluster of clusters) deduped.push(pickBestOfCluster(cluster));
  }

  return deduped;
}
