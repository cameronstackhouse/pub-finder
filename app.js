const POSTCODES_API = "https://api.postcodes.io/postcodes/";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const MILES_TO_METRES = 1609.34;

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
let origin = null;
let map = null;
let marker = null;
let activePub = null;

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

async function runSearch() {
  const postcode = postcodeInput.value.trim();
  const radiusMiles = parseFloat(radiusInput.value);
  if (!postcode) return;

  setBusy(true);
  setStatus("Looking up postcode…");
  resultSection.classList.add("hidden");

  try {
    origin = await geocodePostcode(postcode);
    setStatus("Searching for pubs nearby…");

    const pubs = await findPubs(origin, radiusMiles);

    if (pubs.length === 0) {
      setStatus(
        `No pubs found within ${radiusMiles} miles of ${postcode.toUpperCase()}. Try a bigger radius.`
      );
      pubPool = [];
      pubListEl.innerHTML = "";
      return;
    }

    pubPool = pubs.sort((a, b) => a.distanceMiles - b.distanceMiles);
    setStatus(`Found ${pubs.length} pub${pubs.length === 1 ? "" : "s"} within ${radiusMiles} miles.`);
    renderList();
    showRandomPub();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.");
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

async function findPubs(origin, radiusMiles) {
  const radiusMetres = Math.round(radiusMiles * MILES_TO_METRES);
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="pub"](around:${radiusMetres},${origin.lat},${origin.lon});
      way["amenity"="pub"](around:${radiusMetres},${origin.lat},${origin.lon});
    );
    out center tags;
  `;

  const fetchFrom = async (endpoint) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("bad status " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  // Race all mirrors so a slow/overloaded instance doesn't block the whole search.
  let data;
  try {
    data = await Promise.any(OVERPASS_ENDPOINTS.map(fetchFrom));
  } catch {
    data = null;
  }

  if (!data) {
    throw new Error("Couldn't reach the pub database right now. Please try again shortly.");
  }

  const seen = new Set();
  const pubs = [];

  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const tags = el.tags || {};
    const name = tags.name || "Unnamed pub";
    const key = name + "|" + lat.toFixed(4) + "|" + lon.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);

    const distanceMiles = haversineMiles(origin.lat, origin.lon, lat, lon);
    if (distanceMiles > radiusMiles) continue;

    pubs.push({
      name,
      lat,
      lon,
      distanceMiles,
      address: formatAddress(tags),
    });
  }

  return pubs;
}

function formatAddress(tags) {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Address not available";
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
  directionsLink.href = `https://www.openstreetmap.org/directions?to=${pub.lat}%2C${pub.lon}`;

  resultSection.classList.remove("hidden");
  renderMap(pub);
  highlightActiveListItem();
}

function renderList() {
  pubListEl.innerHTML = "";
  listHeading.textContent = `All ${pubPool.length} pub${pubPool.length === 1 ? "" : "s"} in range, closest first`;

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
