const POSTCODES_API = "https://api.postcodes.io/postcodes/";
const PUBS_DATA_URL = "data/pubs-gb.json";
const NEAREST_FALLBACK_COUNT = 5;

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

// Kick off the static dataset fetch immediately so it's warm (or already
// resolved) by the time the user submits a search.
const pubsDataPromise = loadPubsData();

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

async function loadPubsData() {
  const res = await fetch(PUBS_DATA_URL);
  if (!res.ok) throw new Error("bad status " + res.status);
  const rows = await res.json();
  return rows.map(([name, lat, lon, address]) => ({
    name,
    lat,
    lon,
    address: address || "Address not available",
  }));
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
      pubsDataPromise.catch(() => {
        throw new Error("Couldn't load the pub dataset. Please try again shortly.");
      }),
    ]);

    const withDistance = allPubs
      .map((pub) => ({ ...pub, distanceMiles: haversineMiles(origin.lat, origin.lon, pub.lat, pub.lon) }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    const withinRadius = withDistance.filter((pub) => pub.distanceMiles <= radiusMiles);

    if (withinRadius.length > 0) {
      pubPool = withinRadius;
      setStatus(`Found ${pubPool.length} pub${pubPool.length === 1 ? "" : "s"} within ${radiusMiles} miles.`);
    } else {
      pubPool = withDistance.slice(0, NEAREST_FALLBACK_COUNT);
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
