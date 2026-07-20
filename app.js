const POSTCODES_API = "https://api.postcodes.io/postcodes/";
const PUBS_DATA_URL = "data/pubs-gb.json";
const NEAREST_FALLBACK_COUNT = 5;
const DATA_FETCH_TIMEOUT_MS = 20000;

const form = document.getElementById("search-form");
const postcodeInput = document.getElementById("postcode");
const radiusInput = document.getElementById("radius");
const radiusValue = document.getElementById("radius-value");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result");
const rerollBtn = document.getElementById("reroll-btn");
const directionsLink = document.getElementById("directions-link");
const listHeading = document.getElementById("list-heading");
const pubListEl = document.getElementById("pub-list");

let pubPool = [];
let map = null;
let marker = null;
let activePub = null;
let pubsDataCache = null;

// Warm the cache immediately so it's ready (or already loaded) by the time
// the user submits a search. Failures are intentionally not cached here --
// getPubsData() below retries the fetch on every call until one succeeds,
// so a one-off network blip on this warm-up doesn't permanently break every
// later search (it used to, when the fetch promise itself was memoized).
getPubsData().catch(() => {});

radiusInput.addEventListener("input", () => {
  radiusValue.textContent = radiusInput.value;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await runSearch();
});

rerollBtn.addEventListener("click", () => {
  if (pubPool.length === 0) return;
  showRandomPub();
});

async function getPubsData() {
  if (pubsDataCache) return pubsDataCache;
  pubsDataCache = await loadPubsData();
  return pubsDataCache;
}

async function loadPubsData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(PUBS_DATA_URL, { signal: controller.signal });
    if (!res.ok) throw new Error("bad status " + res.status);
    const rows = await res.json();
    return rows.map(([name, lat, lon, address]) => ({
      name,
      lat,
      lon,
      address: address || "Address not available",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

async function runSearch() {
  const postcode = postcodeInput.value.trim();
  const radiusMiles = parseFloat(radiusInput.value);
  if (!postcode) return;

  setBusy(true);
  setStatus("Looking up postcode…");
  resultSection.classList.add("hidden");

  try {
    const [origin, allPubs] = await Promise.all([
      geocodePostcode(postcode),
      getPubsData().catch(() => {
        // Not cached on failure -- the *next* search attempt will retry the fetch.
        throw new Error("Couldn't load the pub dataset. Please try again.");
      }),
    ]);

    const { pubs, isFallback } = searchPubs(allPubs, origin, radiusMiles);
    pubPool = pubs;

    if (!isFallback) {
      setStatus(`Found ${pubPool.length} pub${pubPool.length === 1 ? "" : "s"} within ${radiusMiles} miles.`);
    } else {
      setStatus(
        `No pubs within ${radiusMiles} miles of ${postcode.toUpperCase()} — showing the ${pubPool.length} closest instead.`
      );
    }

    renderList();
    showRandomPub();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.");
    pubPool = [];
    pubListEl.innerHTML = "";
  } finally {
    setBusy(false);
  }
}

async function geocodePostcode(postcode) {
  const url = POSTCODES_API + encodeURIComponent(postcode.replace(/\s+/g, ""));
  const res = await fetch(url);

  if (res.status === 404) {
    throw new Error("That postcode wasn't recognised. Double check it and try again.");
  }
  if (!res.ok) {
    throw new Error("Couldn't look up that postcode right now. Please try again.");
  }

  const data = await res.json();
  return {
    lat: data.result.latitude,
    lon: data.result.longitude,
    label: data.result.postcode,
  };
}

// Same physical pub sometimes appears twice in the OSM data (e.g. a node
// and a way both tagged amenity=pub for the same building). Address tags
// are frequently missing on one of the two, so matching on name + address
// text alone misses that case -- instead this groups by name and then
// clusters entries of the same name that are within a few dozen metres of
// each other, keeping whichever copy has a usable address.
const DEDUPE_DISTANCE_MILES = 0.05; // ~80m

function dedupePubs(pubs) {
  const groups = new Map();
  for (const pub of pubs) {
    const key = pub.name.trim().toLowerCase();
    const group = groups.get(key);
    if (group) group.push(pub);
    else groups.set(key, [pub]);
  }

  const deduped = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const clusters = [];
    for (const pub of group) {
      const cluster = clusters.find(
        (c) => haversineMiles(c[0].lat, c[0].lon, pub.lat, pub.lon) <= DEDUPE_DISTANCE_MILES
      );
      if (cluster) cluster.push(pub);
      else clusters.push([pub]);
    }
    for (const cluster of clusters) deduped.push(pickBestOfCluster(cluster));
  }

  return deduped;
}

function pickBestOfCluster(cluster) {
  if (cluster.length === 1) return cluster[0];
  return cluster.slice().sort((a, b) => {
    const aHasAddress = a.address === "Address not available" ? 1 : 0;
    const bHasAddress = b.address === "Address not available" ? 1 : 0;
    if (aHasAddress !== bHasAddress) return aHasAddress - bHasAddress;
    return a.distanceMiles - b.distanceMiles;
  })[0];
}

// Filters the full dataset down to pubs within radiusMiles of origin. Only
// pubs that actually match get a distance-tagged copy allocated, and
// deduping/sorting only ever runs on that (usually much smaller) matching
// set -- the full ~56k dataset is never copied, deduped, or sorted
// wholesale on the common path. Falls back to the nearest few pubs overall
// when nothing is in range.
function searchPubs(allPubs, origin, radiusMiles) {
  const withinRadius = [];

  for (const pub of allPubs) {
    const distanceMiles = haversineMiles(origin.lat, origin.lon, pub.lat, pub.lon);
    if (distanceMiles <= radiusMiles) {
      withinRadius.push({ ...pub, distanceMiles });
    }
  }

  if (withinRadius.length > 0) {
    const deduped = dedupePubs(withinRadius);
    deduped.sort((a, b) => a.distanceMiles - b.distanceMiles);
    return { pubs: deduped, isFallback: false };
  }

  // Rare path (nothing in radius): grab more candidates than needed before
  // deduping, rather than deduping the full dataset just to throw most of
  // it away.
  const nearestCandidates = allPubs
    .map((pub) => ({ ...pub, distanceMiles: haversineMiles(origin.lat, origin.lon, pub.lat, pub.lon) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, NEAREST_FALLBACK_COUNT * 4);

  const nearest = dedupePubs(nearestCandidates).slice(0, NEAREST_FALLBACK_COUNT);

  return { pubs: nearest, isFallback: true };
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function showRandomPub() {
  const pub = pubPool[Math.floor(Math.random() * pubPool.length)];
  showPub(pub);
}

function showPub(pub) {
  activePub = pub;

  document.getElementById("pub-name").textContent = pub.name;
  document.getElementById("pub-address").textContent = pub.address;
  document.getElementById("pub-distance").textContent = `${pub.distanceMiles.toFixed(2)} miles away`;
  directionsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${pub.lat}%2C${pub.lon}`;

  resultSection.classList.remove("hidden");
  renderMap(pub);
  highlightActiveListItem();
}

function renderList() {
  pubListEl.innerHTML = "";
  listHeading.textContent = `${pubPool.length} pub${pubPool.length === 1 ? "" : "s"}, closest first`;

  for (const pub of pubPool) {
    const li = document.createElement("li");
    li.dataset.key = pub.name + pub.lat + pub.lon;

    const info = document.createElement("span");
    const name = document.createElement("span");
    name.className = "pub-list-name";
    name.textContent = pub.name;
    const address = document.createElement("span");
    address.className = "pub-list-address";
    address.textContent = pub.address;
    info.appendChild(name);
    info.appendChild(address);

    const distance = document.createElement("span");
    distance.className = "pub-list-distance";
    distance.textContent = `${pub.distanceMiles.toFixed(2)} mi`;

    li.appendChild(info);
    li.appendChild(distance);
    li.addEventListener("click", () => showPub(pub));

    pubListEl.appendChild(li);
  }
}

function highlightActiveListItem() {
  if (!activePub) return;
  const activeKey = activePub.name + activePub.lat + activePub.lon;
  for (const li of pubListEl.children) {
    li.classList.toggle("active", li.dataset.key === activeKey);
  }
}

function renderMap(pub) {
  if (!map) {
    map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
  }

  map.setView([pub.lat, pub.lon], 16);

  if (marker) marker.remove();
  marker = L.marker([pub.lat, pub.lon]).addTo(map).bindPopup(pub.name).openPopup();

  setTimeout(() => map.invalidateSize(), 100);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.textContent = busy ? "Searching…" : "Find me a pub";
}
