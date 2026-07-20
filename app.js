const POSTCODES_API = "https://api.postcodes.io/postcodes/";
const PUBS_DATA_URL = "data/pubs-gb.json";
const NEAREST_FALLBACK_COUNT = 5;
const DATA_FETCH_TIMEOUT_MS = 20000;
const FAVOURITES_KEY = "pubFinder.favourites";
const BANNED_PUBS_KEY = "pubFinder.bannedPubs";
const RECENT_SEARCHES_KEY = "pubFinder.recentSearches";
const THEME_KEY = "pubFinder.theme";
const RECENT_SEARCHES_MAX = 6;
const WALK_SPEED_MPH = 3;

/**
 * @typedef {Object} Pub
 * @property {string} name
 * @property {number} lat
 * @property {number} lon
 * @property {string} address
 * @property {string} operator
 * @property {string} website
 * @property {string} phone
 * @property {string} openingHours
 * @property {string} wikipedia
 * @property {boolean} beerGarden
 * @property {boolean} dogFriendly
 * @property {boolean} foodServed
 * @property {""|"yes"|"limited"|"no"} wheelchair
 * @property {boolean} realAle
 * @property {boolean} paymentCash
 * @property {boolean} paymentCardYes
 * @property {boolean} paymentCardNo
 * @property {string} description
 * @property {string} image
 * @property {string} listedStatus
 * @property {string} startDate
 * @property {boolean} darts
 * @property {boolean} pool
 * @property {boolean} nearSea
 * @property {number} [distanceMiles] Only set once a pub has been matched against a search origin; absent for a pub viewed straight from favourites.
 * @property {{extract: string, url: string, thumbnail: string|null}} [wikiSummaryCache] Populated lazily the first time "Tell me more" fetches this pub's Wikipedia summary.
 */

/**
 * @typedef {Object} Origin
 * @property {number} lat
 * @property {number} lon
 * @property {string} label
 */

/**
 * A pub identified just by name/lat/lon -- enough for pubKey() matching and
 * to display in a manage list. Used for the banned-pubs store, which (like
 * favourites) doesn't need the full Pub shape.
 * @typedef {Object} BannedPub
 * @property {string} name
 * @property {number} lat
 * @property {number} lon
 */

/**
 * Thin wrapper around document.getElementById that lets call sites cast to
 * the specific element subtype they need (all of these IDs are hardcoded in
 * our own index.html, so the element is guaranteed to exist and be of that
 * type -- this isn't asserting anything we don't already know to be true).
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} id
 * @returns {T}
 */
function getEl(id) {
  return /** @type {T} */ (document.getElementById(id));
}

const form = getEl("search-form");
const postcodeInput = /** @type {HTMLInputElement} */ (getEl("postcode"));
const radiusInput = /** @type {HTMLInputElement} */ (getEl("radius"));
const radiusValue = getEl("radius-value");
const submitBtn = /** @type {HTMLButtonElement} */ (getEl("submit-btn"));
const locationBtn = /** @type {HTMLButtonElement} */ (getEl("location-btn"));
const themeToggleBtn = getEl("theme-toggle");
const filterChipsEl = getEl("filter-chips");
const statusEl = getEl("status");
const resultSection = getEl("result");
const rerollBtn = /** @type {HTMLButtonElement} */ (getEl("reroll-btn"));
const directionsLink = /** @type {HTMLAnchorElement} */ (getEl("directions-link"));
const listHeading = getEl("list-heading");
const pubListEl = getEl("pub-list");
const moreInfoBtn = /** @type {HTMLButtonElement} */ (getEl("more-info-btn"));
const moreInfoPanel = getEl("more-info");
const moreInfoStatus = getEl("more-info-status");
const moreInfoFacts = getEl("more-info-facts");
const wikiSummaryEl = getEl("wiki-summary");
const wikiThumb = /** @type {HTMLImageElement} */ (getEl("wiki-thumb"));
const wikiExtract = getEl("wiki-extract");
const wikiLink = /** @type {HTMLAnchorElement} */ (getEl("wiki-link"));
const osmEditLink = /** @type {HTMLAnchorElement} */ (getEl("osm-edit-link"));
const favouriteBtn = /** @type {HTMLButtonElement} */ (getEl("favourite-btn"));
const banBtn = /** @type {HTMLButtonElement} */ (getEl("ban-btn"));
const tabSearchBtn = /** @type {HTMLButtonElement} */ (getEl("tab-search"));
const tabCrawlBtn = /** @type {HTMLButtonElement} */ (getEl("tab-crawl"));
const tabFavouritesBtn = /** @type {HTMLButtonElement} */ (getEl("tab-favourites"));
const searchView = getEl("search-view");
const crawlView = getEl("crawl-view");
const favouritesView = getEl("favourites-view");
const favouritesCountEl = getEl("favourites-count");
const favouritesListEl = getEl("favourites-list");
const favouritesEmptyEl = getEl("favourites-empty");
const bannedHeadingEl = getEl("banned-heading");
const bannedListEl = getEl("banned-list");
const recentSearchesEl = getEl("recent-searches");
const dataFreshnessEl = getEl("data-freshness");
const crawlForm = getEl("crawl-form");
const crawlPostcodeInput = /** @type {HTMLInputElement} */ (getEl("crawl-postcode"));
const crawlStopsInput = /** @type {HTMLInputElement} */ (getEl("crawl-stops"));
const crawlStopsValue = getEl("crawl-stops-value");
const crawlStartWalkInput = /** @type {HTMLInputElement} */ (getEl("crawl-start-walk"));
const crawlStartWalkValue = getEl("crawl-start-walk-value");
const crawlMaxLegInput = /** @type {HTMLInputElement} */ (getEl("crawl-max-leg"));
const crawlMaxLegValue = getEl("crawl-max-leg-value");
const crawlFilterChipsEl = getEl("crawl-filter-chips");
const crawlSubmitBtn = /** @type {HTMLButtonElement} */ (getEl("crawl-submit-btn"));
const crawlLocationBtn = /** @type {HTMLButtonElement} */ (getEl("crawl-location-btn"));
const crawlStatusEl = getEl("crawl-status");
const crawlResultEl = getEl("crawl-result");
const crawlOriginLabelEl = getEl("crawl-origin-label");
const shuffleCrawlBtn = /** @type {HTMLButtonElement} */ (getEl("shuffle-crawl-btn"));
const crawlRouteListEl = getEl("crawl-route-list");
const crawlRouteSummaryEl = getEl("crawl-route-summary");
const crawlDirectionsLink = /** @type {HTMLAnchorElement} */ (getEl("crawl-directions-link"));

/** @type {Pub[]} */
let pubPool = [];
/** @type {any} Leaflet map instance; see types/leaflet.d.ts for why L itself is untyped. */
let map = null;
/** @type {any} */
let marker = null;
/** @type {Pub|null} */
let activePub = null;
/** @type {Pub[]|null} */
let pubsDataCache = null;
/** @type {string|null} */
let currentSearchKey = null;
// The pub crawl planner is a self-contained flow with its own start point --
// it deliberately doesn't reuse pubPool/the main search's origin, since a
// crawl's "closest N, walkable between stops" candidate set is a different
// shape of query to a plain radius search.
/** @type {Origin|null} */
let crawlOrigin = null;
/** @type {Pub[]} Nearest deduped candidates around crawlOrigin, computed once per "Plan my crawl"/location request and re-used by the shuffle button. */
let crawlCandidates = [];
// Pubs the user has pinned so a shuffle keeps them instead of rerolling
// everything. Keyed by pubKey() rather than holding Pub[] directly so
// membership checks against freshly-rendered stops are just a Set lookup.
/** @type {Set<string>} */
let lockedStopKeys = new Set();
/** @type {any} Leaflet map instance for the crawl route; separate from `map` above. */
let crawlMap = null;
/** @type {any[]} Markers/polyline currently drawn on crawlMap, cleared and redrawn on each route rebuild. */
let crawlMapLayers = [];
// Values come from each chip's data-filter HTML attribute, so this stays a
// plain Set<string> rather than the literal union -- TS can't verify a DOM
// attribute against a union, and pretending otherwise would just mean
// casting at the one call site that reads it instead of here.
/** @type {Set<string>} */
const activeFilters = new Set();
/** @type {Set<string>} Separate from activeFilters -- the crawl planner is an independent flow with its own start point and candidate pool. */
const crawlActiveFilters = new Set();

// Warm the cache immediately so it's ready (or already loaded) by the time
// the user submits a search. Failures are intentionally not cached here --
// getPubsData() below retries the fetch on every call until one succeeds,
// so a one-off network blip on this warm-up doesn't permanently break every
// later search (it used to, when the fetch promise itself was memoized).
getPubsData().catch(() => {});
registerServiceWorker();
updateFavouritesBadge();
renderRecentSearches();
loadSearchFromUrl();
applyTheme(getStoredTheme());
loadDataFreshness().catch(() => {});

radiusInput.addEventListener("input", () => {
  radiusValue.textContent = radiusInput.value;
});

tabSearchBtn.addEventListener("click", () => switchView("search"));
tabCrawlBtn.addEventListener("click", () => switchView("crawl"));
tabFavouritesBtn.addEventListener("click", () => switchView("favourites"));

favouriteBtn.addEventListener("click", () => {
  if (!activePub) return;
  toggleFavourite(activePub);
  updateFavouriteButtonState(activePub);
});

banBtn.addEventListener("click", () => {
  if (!activePub) return;
  banPub(activePub);
  const bannedKey = pubKey(activePub);
  pubPool = pubPool.filter((p) => pubKey(p) !== bannedKey);
  renderList();
  if (pubPool.length > 0) {
    showRandomPub();
  } else {
    resultSection.classList.add("hidden");
    setStatus("No more pubs match — try adjusting your filters or radius.");
  }
});

locationBtn.addEventListener("click", () => {
  runLocationSearch();
});

themeToggleBtn.addEventListener("click", () => {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(getStoredTheme()) + 1) % order.length];
  setStoredTheme(next);
  applyTheme(next);
});

filterChipsEl.addEventListener("click", (e) => {
  const btn = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest("button[data-filter]"));
  if (!btn) return;
  const filter = btn.dataset.filter;
  if (activeFilters.has(filter)) activeFilters.delete(filter);
  else activeFilters.add(filter);
  btn.classList.toggle("active", activeFilters.has(filter));
  btn.setAttribute("aria-pressed", activeFilters.has(filter) ? "true" : "false");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await runSearch();
});

crawlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const postcode = crawlPostcodeInput.value.trim();
  if (!postcode) return;
  await runCrawlPlan({ resolveOrigin: () => geocodePostcode(postcode), statusVerb: "Looking up postcode…" });
});

crawlLocationBtn.addEventListener("click", () => {
  runCrawlPlan({ resolveOrigin: geolocateUser, statusVerb: "Finding your location…" });
});

crawlStopsInput.addEventListener("input", () => {
  crawlStopsValue.textContent = crawlStopsInput.value;
  if (crawlOrigin) buildAndRenderCrawl({ randomize: false });
});

crawlStartWalkInput.addEventListener("input", () => {
  crawlStartWalkValue.textContent = crawlStartWalkInput.value;
  // Changes the candidate pool itself (how far out we're willing to look),
  // not just which of the existing candidates get picked -- needs a refetch.
  if (crawlOrigin) refreshCrawlCandidates();
});

crawlMaxLegInput.addEventListener("input", () => {
  crawlMaxLegValue.textContent = parseFloat(crawlMaxLegInput.value).toFixed(1);
  if (crawlOrigin) buildAndRenderCrawl({ randomize: false });
});

crawlFilterChipsEl.addEventListener("click", (e) => {
  const btn = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest("button[data-filter]"));
  if (!btn) return;
  const filter = btn.dataset.filter;
  if (crawlActiveFilters.has(filter)) crawlActiveFilters.delete(filter);
  else crawlActiveFilters.add(filter);
  btn.classList.toggle("active", crawlActiveFilters.has(filter));
  btn.setAttribute("aria-pressed", crawlActiveFilters.has(filter) ? "true" : "false");
  if (crawlOrigin) refreshCrawlCandidates();
});

shuffleCrawlBtn.addEventListener("click", () => {
  buildAndRenderCrawl({ randomize: true });
});

rerollBtn.addEventListener("click", () => {
  if (pubPool.length === 0) return;
  showRandomPub();
});

moreInfoBtn.addEventListener("click", () => {
  if (!activePub) return;
  if (moreInfoPanel.classList.contains("hidden")) {
    openMoreInfo(activePub);
  } else {
    moreInfoPanel.classList.add("hidden");
    moreInfoBtn.textContent = "Tell me more";
  }
});

/** @returns {Promise<Pub[]>} */
async function getPubsData() {
  if (pubsDataCache) return pubsDataCache;
  pubsDataCache = await loadPubsData();
  return pubsDataCache;
}

/** @returns {Promise<Pub[]>} */
async function loadPubsData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(PUBS_DATA_URL, { signal: controller.signal });
    if (!res.ok) throw new Error("bad status " + res.status);
    const rows = await res.json();
    return rows.map(
      ([
        name,
        lat,
        lon,
        address,
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
      ]) => ({
        name,
        lat,
        lon,
        address: address || "Address not available",
        operator: operator || "",
        website: website || "",
        phone: phone || "",
        openingHours: openingHours || "",
        wikipedia: wikipedia || "",
        beerGarden: Boolean(beerGarden),
        dogFriendly: Boolean(dogFriendly),
        foodServed: Boolean(foodServed),
        wheelchair: wheelchair || "",
        realAle: Boolean(realAle),
        paymentCash: Boolean(paymentCash),
        paymentCardYes: Boolean(paymentCardYes),
        paymentCardNo: Boolean(paymentCardNo),
        description: description || "",
        image: image || "",
        listedStatus: listedStatus || "",
        startDate: startDate || "",
        darts: Boolean(darts),
        pool: Boolean(pool),
        nearSea: Boolean(nearSea),
      })
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function runSearch() {
  const postcode = postcodeInput.value.trim();
  if (!postcode) return;

  await performSearch({
    statusVerb: "Looking up postcode…",
    resolveOrigin: () => geocodePostcode(postcode),
    label: postcode.toUpperCase(),
    onSuccess: (radiusMiles) => {
      recordRecentSearch(postcode, radiusMiles);
      updateUrlForSearch(postcode, radiusMiles);
    },
  });
}

async function runLocationSearch() {
  await performSearch({
    statusVerb: "Finding your location…",
    resolveOrigin: geolocateUser,
    label: "your location",
    onSuccess: () => {
      // A geolocation search isn't a reusable postcode, so it doesn't get a
      // recent-search chip or a shareable URL the way a postcode search does.
      postcodeInput.value = "";
      currentSearchKey = null;
      renderRecentSearches();
    },
  });
}

/**
 * @param {Object} options
 * @param {string} options.statusVerb
 * @param {() => Promise<Origin>} options.resolveOrigin
 * @param {string} options.label
 * @param {(radiusMiles: number) => void} options.onSuccess
 */
async function performSearch({ statusVerb, resolveOrigin, label, onSuccess }) {
  const radiusMiles = parseFloat(radiusInput.value);

  setBusy(true);
  setStatus(statusVerb);
  resultSection.classList.add("hidden");

  try {
    const [origin, allPubs] = await Promise.all([
      resolveOrigin(),
      getPubsData().catch(() => {
        // Not cached on failure -- the *next* search attempt will retry the fetch.
        throw new Error("Couldn't load the pub dataset. Please try again.");
      }),
    ]);

    const candidatePubs = excludeBannedPubs(applyPubFilters(allPubs, activeFilters));
    if (candidatePubs.length === 0) {
      setStatus("No pubs match your selected filters anywhere. Try turning one off.");
      pubPool = [];
      pubListEl.innerHTML = "";
      return;
    }

    const { pubs, isFallback } = searchPubs(candidatePubs, origin, radiusMiles);
    pubPool = pubs;

    if (!isFallback) {
      setStatus(`Found ${pubPool.length} pub${pubPool.length === 1 ? "" : "s"} within ${radiusMiles} miles.`);
    } else {
      setStatus(
        `No matching pubs within ${radiusMiles} miles of ${label} — showing the ${pubPool.length} closest instead.`
      );
    }

    renderList();
    showRandomPub();
    onSuccess(radiusMiles);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.");
    pubPool = [];
    pubListEl.innerHTML = "";
  } finally {
    setBusy(false);
  }
}

/** @returns {Promise<Origin>} */
function geolocateUser() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation isn't supported by this browser. Enter a postcode instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "your location" }),
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Enter a postcode instead."
            : "Couldn't get your location. Enter a postcode instead.";
        reject(new Error(message));
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

/**
 * @param {Pub[]} pubs
 * @param {Set<string>} filters
 * @returns {Pub[]}
 */
function applyPubFilters(pubs, filters) {
  if (filters.size === 0) return pubs;
  return pubs.filter(
    (pub) =>
      (!filters.has("beerGarden") || pub.beerGarden) &&
      (!filters.has("dogFriendly") || pub.dogFriendly) &&
      (!filters.has("foodServed") || pub.foodServed) &&
      (!filters.has("nearSea") || pub.nearSea)
  );
}

/**
 * @param {string} postcode
 * @returns {Promise<Origin>}
 */
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

/**
 * @param {Pub[]} pubs
 * @returns {Pub[]}
 */
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

/**
 * @param {Pub[]} cluster
 * @returns {Pub}
 */
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
/**
 * @param {Pub[]} allPubs
 * @param {Origin} origin
 * @param {number} radiusMiles
 * @returns {{pubs: Pub[], isFallback: boolean}}
 */
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

function formatWalkTime(distanceMiles) {
  const totalMinutes = Math.round((distanceMiles / WALK_SPEED_MPH) * 60);
  if (totalMinutes < 1) return "under a minute";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

// A deliberately conservative subset of the OSM opening_hours spec: day
// ranges/lists (Mo-Fr, Sa-Su, Mo,We,Fr) combined with one or more time
// ranges (11:00-23:00, with commas for split hours), separated by ";" for
// multiple rules, plus the special case "24/7". Anything involving public
// holidays, seasons, months, or other syntax we don't handle causes the
// whole spec to be rejected (returns null) -- showing no status is far
// better than confidently claiming a pub is open or closed based on a
// guess about a format we don't actually understand.
const OPENING_HOURS_DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseOpeningHours(spec) {
  if (!spec) return null;
  const trimmed = spec.trim();
  if (/^24\/7$/i.test(trimmed)) {
    return [{ days: [0, 1, 2, 3, 4, 5, 6], start: 0, end: 24 * 60 }];
  }

  const rules = [];
  const segments = trimmed.split(";").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (/PH|SH|off|week|holiday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(segment)) {
      return null;
    }

    const match = segment.match(/^([A-Za-z,-]+)\s+(.+)$/);
    let days, timePart;
    if (match) {
      days = parseOpeningHoursDays(match[1]);
      if (!days) return null;
      timePart = match[2];
    } else {
      // No day prefix at all (e.g. "11:30-23:00") is valid OSM shorthand
      // meaning every day of the week.
      days = [0, 1, 2, 3, 4, 5, 6];
      timePart = segment;
    }

    for (const range of timePart.split(",").map((t) => t.trim())) {
      const timeMatch = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (!timeMatch) return null;
      const [sh, sm, eh, em] = timeMatch.slice(1).map(Number);
      rules.push({ days, start: sh * 60 + sm, end: eh * 60 + em });
    }
  }

  return rules;
}

function parseOpeningHoursDays(dayPart) {
  const days = new Set();
  for (const token of dayPart.split(",")) {
    const rangeMatch = token.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
    if (rangeMatch) {
      const startIdx = OPENING_HOURS_DAY_ORDER.indexOf(rangeMatch[1]);
      const endIdx = OPENING_HOURS_DAY_ORDER.indexOf(rangeMatch[2]);
      if (startIdx === -1 || endIdx === -1) return null;
      for (let i = startIdx; ; i = (i + 1) % 7) {
        days.add(i);
        if (i === endIdx) break;
      }
    } else {
      const idx = OPENING_HOURS_DAY_ORDER.indexOf(token);
      if (idx === -1) return null;
      days.add(idx);
    }
  }
  return [...days];
}

function isOpenAt(rules, date) {
  const day = (date.getDay() + 6) % 7; // convert JS Sun=0..Sat=6 to Mo=0..Su=6
  const prevDay = (day + 6) % 7;
  const minutes = date.getHours() * 60 + date.getMinutes();

  for (const rule of rules) {
    const crossesMidnight = rule.end <= rule.start;
    if (!crossesMidnight) {
      if (rule.days.includes(day) && minutes >= rule.start && minutes < rule.end) return true;
    } else {
      if (rule.days.includes(day) && minutes >= rule.start) return true;
      if (rule.days.includes(prevDay) && minutes < rule.end) return true;
    }
  }
  return false;
}

// Returns "open", "closed", or null (spec absent or too complex to trust).
function getOpenStatus(openingHours) {
  const rules = parseOpeningHours(openingHours);
  if (!rules) return null;
  return isOpenAt(rules, new Date()) ? "open" : "closed";
}

function showRandomPub() {
  const pub = pubPool[Math.floor(Math.random() * pubPool.length)];
  showPub(pub);
}

/** @param {Pub} pub */
function showPub(pub) {
  activePub = pub;

  getEl("pub-name").textContent = pub.name;
  getEl("pub-address").textContent = pub.address;
  getEl("pub-operator").textContent = pub.operator ? `Run by ${pub.operator}` : "";
  getEl("pub-operator").classList.toggle("hidden", !pub.operator);

  const openStatus = getOpenStatus(pub.openingHours);
  const openBadge = getEl("pub-open-status");
  openBadge.classList.toggle("hidden", !openStatus);
  if (openStatus) {
    openBadge.textContent = openStatus === "open" ? "Open now" : "Closed now";
    openBadge.classList.toggle("open", openStatus === "open");
    openBadge.classList.toggle("closed", openStatus === "closed");
  }

  getEl("pub-distance").textContent =
    typeof pub.distanceMiles === "number"
      ? `${pub.distanceMiles.toFixed(2)} miles away · ~${formatWalkTime(pub.distanceMiles)} walk`
      : "";
  directionsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${pub.lat}%2C${pub.lon}`;

  resultSection.classList.remove("hidden");
  renderMap(pub);
  highlightActiveListItem();
  updateFavouriteButtonState(pub);

  // Collapse any detail panel left open from the previous pub.
  moreInfoPanel.classList.add("hidden");
  moreInfoBtn.textContent = "Tell me more";
  moreInfoStatus.textContent = "";
  moreInfoFacts.innerHTML = "";
  wikiSummaryEl.classList.add("hidden");
}

// Shows facts already in our free dataset (opening hours/phone/website from
// OSM tags) plus, when the pub has a linked Wikipedia article, a real
// summary fetched from Wikipedia's free public API -- no API key, no AI,
// no invented details about a real business.
/** @param {Pub} pub */
async function openMoreInfo(pub) {
  moreInfoPanel.classList.remove("hidden");
  moreInfoBtn.textContent = "Hide details";
  moreInfoStatus.textContent = "";
  const factCount = renderFacts(pub);
  renderDescription(pub);
  wikiSummaryEl.classList.add("hidden");
  // Zoom 19 is close enough to land right on the pub building in the OSM
  // editor without the user having to hunt for it themselves.
  osmEditLink.href = `https://www.openstreetmap.org/edit#map=19/${pub.lat}/${pub.lon}`;

  const hasOwnContent = factCount > 0 || Boolean(pub.description);

  if (!pub.wikipedia) {
    if (!hasOwnContent) moreInfoStatus.textContent = "No extra details available for this pub.";
    return;
  }

  if (pub.wikiSummaryCache) {
    renderWikiSummary(pub.wikiSummaryCache);
    return;
  }

  moreInfoStatus.textContent = "Loading Wikipedia summary…";
  try {
    const summary = await fetchWikipediaSummary(pub.wikipedia);
    pub.wikiSummaryCache = summary;
    if (activePub !== pub) return; // user moved on before this resolved
    moreInfoStatus.textContent = "";
    renderWikiSummary(summary);
  } catch (err) {
    console.error(err);
    if (activePub !== pub) return;
    moreInfoStatus.textContent = hasOwnContent ? "" : "No extra details available for this pub.";
  }
}

// Only ever claims "Cash only" when a card tag is explicitly "no" -- an
// untagged card status means we don't know, not that cards are refused.
/**
 * @param {Pub} pub
 * @returns {string}
 */
function formatPayment(pub) {
  if (pub.paymentCardYes) return "Card accepted";
  if (pub.paymentCardNo && pub.paymentCash) return "Cash only";
  if (pub.paymentCash) return "Cash accepted";
  return "";
}

/**
 * @param {Pub["wheelchair"]} value
 * @returns {string}
 */
function formatWheelchairAccess(value) {
  if (value === "yes") return "Wheelchair accessible";
  if (value === "limited") return "Limited wheelchair access";
  if (value === "no") return "Not wheelchair accessible";
  return "";
}

// OSM's image tag isn't reliably a direct image URL -- some values are
// pages *about* an image (archive.org item pages, Commons file pages, etc.)
// rather than the image itself, which just renders as a broken-image glyph.
// Not worth trying to validate at build time for ~1% coverage, so this data
// is collected but intentionally never rendered.
/** @param {Pub} pub */
function renderDescription(pub) {
  const descEl = getEl("pub-description");
  descEl.textContent = pub.description || "";
  descEl.classList.toggle("hidden", !pub.description);
}

// Returns the number of fact rows rendered, so the caller can tell whether
// there's genuinely nothing to show for this pub.
/**
 * @param {Pub} pub
 * @returns {number}
 */
function renderFacts(pub) {
  moreInfoFacts.innerHTML = "";

  const amenities = [
    pub.realAle && "Real ale",
    pub.beerGarden && "Beer garden",
    pub.dogFriendly && "Dog-friendly",
    pub.foodServed && "Food served",
    pub.darts && "Darts",
    pub.pool && "Pool table",
    pub.nearSea && "Near the sea",
  ].filter(Boolean);

  const entries = [
    pub.openingHours && ["Opening hours", pub.openingHours, "text"],
    pub.phone && ["Phone", pub.phone, "tel"],
    pub.website && ["Website", pub.website, "url"],
    formatWheelchairAccess(pub.wheelchair) && ["Access", formatWheelchairAccess(pub.wheelchair), "text"],
    formatPayment(pub) && ["Payment", formatPayment(pub), "text"],
    pub.listedStatus && ["Listed building", pub.listedStatus, "text"],
    pub.startDate && ["Built", pub.startDate, "text"],
    amenities.length > 0 && ["Amenities", amenities.join(", "), "text"],
  ].filter(Boolean);

  for (const [label, value, kind] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");

    if (kind === "url") {
      const a = document.createElement("a");
      a.href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      a.textContent = value;
      a.target = "_blank";
      a.rel = "noopener";
      dd.appendChild(a);
    } else if (kind === "tel") {
      const a = document.createElement("a");
      a.href = `tel:${value.replace(/\s+/g, "")}`;
      a.textContent = value;
      dd.appendChild(a);
    } else {
      dd.textContent = value;
    }

    moreInfoFacts.appendChild(dt);
    moreInfoFacts.appendChild(dd);
  }

  return entries.length;
}

/** @param {{extract: string, url: string, thumbnail: string|null}} summary */
function renderWikiSummary(summary) {
  wikiExtract.textContent = summary.extract;
  wikiLink.href = summary.url;
  if (summary.thumbnail) {
    wikiThumb.src = summary.thumbnail;
    wikiThumb.classList.remove("hidden");
  } else {
    wikiThumb.classList.add("hidden");
    wikiThumb.removeAttribute("src");
  }
  wikiSummaryEl.classList.remove("hidden");
}

// OSM's wikipedia tag format is "lang:Title", e.g. "en:Ye Olde Trip to Jerusalem".
/**
 * @param {string} wikipediaTag
 * @returns {Promise<{extract: string, url: string, thumbnail: string|null}>}
 */
async function fetchWikipediaSummary(wikipediaTag) {
  const match = wikipediaTag.match(/^([a-z-]+):(.+)$/i);
  if (!match) throw new Error("Unrecognised wikipedia tag format");
  const [, lang, title] = match;

  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("bad status " + res.status);
    const data = await res.json();
    return {
      extract: data.extract || "",
      url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnail: data.thumbnail?.source || null,
    };
  } finally {
    clearTimeout(timeout);
  }
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

    const openStatus = getOpenStatus(pub.openingHours);
    if (openStatus) {
      const dot = document.createElement("span");
      dot.className = `open-dot ${openStatus}`;
      dot.title = openStatus === "open" ? "Open now" : "Closed now";
      name.appendChild(dot);
    }

    const address = document.createElement("span");
    address.className = "pub-list-address";
    address.textContent = pub.operator ? `${pub.address} · ${pub.operator}` : pub.address;
    info.appendChild(name);
    info.appendChild(address);

    const distance = document.createElement("span");
    distance.className = "pub-list-distance";
    distance.textContent = `${pub.distanceMiles.toFixed(2)} mi · ~${formatWalkTime(pub.distanceMiles)}`;

    li.appendChild(info);
    li.appendChild(distance);
    li.addEventListener("click", () => showPub(pub));

    pubListEl.appendChild(li);
  }
}

function highlightActiveListItem() {
  if (!activePub) return;
  const activeKey = activePub.name + activePub.lat + activePub.lon;
  for (const child of pubListEl.children) {
    const li = /** @type {HTMLElement} */ (child);
    li.classList.toggle("active", li.dataset.key === activeKey);
  }
}

/** @param {boolean} busy */
function setCrawlBusy(busy) {
  crawlSubmitBtn.disabled = busy;
  crawlSubmitBtn.textContent = busy ? "Planning…" : "Plan my crawl";
  crawlLocationBtn.disabled = busy;
}

/** @param {string} text */
function setCrawlStatus(text) {
  crawlStatusEl.textContent = text;
}

// Resolves a start point, then gathers the nearest candidate pubs around it
// -- "nearest N" rather than a fixed search radius, so this always finds
// candidates even in a sparse rural area instead of coming back empty.
/**
 * @param {Object} options
 * @param {() => Promise<Origin>} options.resolveOrigin
 * @param {string} options.statusVerb
 */
async function runCrawlPlan({ resolveOrigin, statusVerb }) {
  setCrawlBusy(true);
  setCrawlStatus(statusVerb);
  crawlResultEl.classList.add("hidden");

  try {
    const [origin, allPubs] = await Promise.all([
      resolveOrigin(),
      getPubsData().catch(() => {
        throw new Error("Couldn't load the pub dataset. Please try again.");
      }),
    ]);

    crawlOrigin = origin;
    lockedStopKeys = new Set();
    if (!(await loadCrawlCandidates())) return;

    buildAndRenderCrawl({ randomize: false });
  } catch (err) {
    console.error(err);
    setCrawlStatus(err.message || "Something went wrong. Please try again.");
  } finally {
    setCrawlBusy(false);
  }
}

// Re-gathers candidates around the existing crawlOrigin -- used when a
// filter chip is toggled after a crawl has already been planned, since
// changing filters changes the candidate pool itself, not just which of
// the existing candidates get chosen as stops.
async function refreshCrawlCandidates() {
  if (!crawlOrigin) return;
  lockedStopKeys = new Set();
  if (!(await loadCrawlCandidates())) return;
  buildAndRenderCrawl({ randomize: false });
}

// Shared by runCrawlPlan and refreshCrawlCandidates: applies the crawl
// filter chips, then gathers the nearest candidates around crawlOrigin.
// Returns false (after setting an explanatory status) if nothing qualifies.
/** @returns {Promise<boolean>} */
async function loadCrawlCandidates() {
  const stopCount = parseInt(crawlStopsInput.value, 10);
  const startWalkMinutes = parseInt(crawlStartWalkInput.value, 10);
  const maxStartDistanceMiles = (startWalkMinutes / 60) * WALK_SPEED_MPH;

  const allPubs = await getPubsData().catch(() => {
    throw new Error("Couldn't load the pub dataset. Please try again.");
  });
  const filtered = excludeBannedPubs(applyPubFilters(allPubs, crawlActiveFilters));
  const candidates = nearestCandidatePubs(
    filtered,
    /** @type {Origin} */ (crawlOrigin),
    Math.max(stopCount * 8, 30),
    maxStartDistanceMiles
  );

  if (candidates.length === 0) {
    setCrawlStatus(
      crawlActiveFilters.size > 0
        ? "No pubs match your filters within that walk of your start point. Try turning a filter off or increasing the walk time."
        : `Couldn't find any pubs within a ${startWalkMinutes}-minute walk of that start point. Try increasing it.`
    );
    crawlResultEl.classList.add("hidden");
    return false;
  }

  crawlCandidates = candidates;
  return true;
}

/**
 * @param {Pub[]} allPubs
 * @param {Origin} origin
 * @param {number} poolSize
 * @param {number} maxDistanceMiles How far from origin a pub is allowed to be to even be considered.
 * @returns {Pub[]} The `poolSize` nearest pubs to origin within maxDistanceMiles, deduped and sorted nearest-first.
 */
function nearestCandidatePubs(allPubs, origin, poolSize, maxDistanceMiles) {
  const withDistance = allPubs
    .map((pub) => ({ ...pub, distanceMiles: haversineMiles(origin.lat, origin.lon, pub.lat, pub.lon) }))
    .filter((pub) => pub.distanceMiles <= maxDistanceMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, poolSize * 4); // headroom before dedupe removes near-duplicate OSM entries

  return dedupePubs(withDistance)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, poolSize);
}

// Picks which candidates become crawl stops by building a chain outward
// from the start point: at each step, narrow to not-yet-used pubs within
// maxLegMiles of wherever the chain currently is (falling back to every
// remaining candidate if none qualify, same as the deterministic pass, so
// it still degrades honestly instead of silently dropping the constraint).
// The deterministic pass then takes the nearest qualifying pub each time;
// "Different pubs" instead picks randomly among the qualifying ones, so it
// gets variety without abandoning the walk-distance limit the builder is
// set to.
/**
 * @param {Pub[]} candidates Nearest-first, already deduped.
 * @param {Origin} origin
 * @param {number} stopCount
 * @param {number} maxLegMiles
 * @param {boolean} randomize
 * @returns {Pub[]}
 */
function selectCrawlStops(candidates, origin, stopCount, maxLegMiles, randomize) {
  const remaining = candidates.slice();
  const chosen = [];
  let current = { lat: origin.lat, lon: origin.lon };

  for (let i = 0; i < stopCount && remaining.length > 0; i++) {
    const within = remaining.filter((p) => haversineMiles(current.lat, current.lon, p.lat, p.lon) <= maxLegMiles);
    const pool = within.length > 0 ? within : remaining;

    let next;
    if (randomize) {
      next = pool[Math.floor(Math.random() * pool.length)];
    } else {
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let j = 0; j < pool.length; j++) {
        const dist = haversineMiles(current.lat, current.lon, pool[j].lat, pool[j].lon);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = j;
        }
      }
      next = pool[bestIndex];
    }

    chosen.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    current = next;
  }

  return chosen;
}

/**
 * @template T
 * @param {T[]} items
 * @returns {Generator<T[]>}
 */
function* permutations(items) {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) {
      yield [items[i], ...perm];
    }
  }
}

// Brute-forces the visiting order that minimises the full loop distance
// (origin -> stops... -> origin), same as a classic closed-loop TSP.
// Crawls are capped at 6 stops, so that's at most 720 permutations to
// check -- trivial.
//
// Minimising raw distance alone isn't enough though: the shortest-total
// loop can still contain one long leg if that's what it takes to keep the
// *sum* down, which is exactly the "insane distance" a max-leg limit is
// supposed to prevent. So orderings that keep every leg (including the
// walk back to the start) within maxLegMiles are strongly preferred --
// only when no such ordering exists at all does it fall back to whichever
// has the fewest/smallest violations, and those get flagged in the UI.
/**
 * @param {Pub[]} stops
 * @param {Origin} origin
 * @param {number} maxLegMiles
 * @returns {Pub[]}
 */
function bestCircularOrder(stops, origin, maxLegMiles) {
  let bestOrder = stops;
  let bestCost = Infinity;

  for (const perm of permutations(stops)) {
    let dist = 0;
    let violations = 0;
    let current = { lat: origin.lat, lon: origin.lon };
    for (const pub of perm) {
      const legDist = haversineMiles(current.lat, current.lon, pub.lat, pub.lon);
      dist += legDist;
      if (legDist > maxLegMiles) violations++;
      current = pub;
    }
    const returnDist = haversineMiles(current.lat, current.lon, origin.lat, origin.lon);
    dist += returnDist;
    if (returnDist > maxLegMiles) violations++;

    // Violations dominate the cost so a legal (if slightly longer) loop
    // always beats an "shorter" one with an out-of-limit leg; distance only
    // breaks ties among orderings with the same violation count.
    const cost = violations * 1000 + dist;
    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = perm;
    }
  }

  return bestOrder;
}

/**
 * @param {Pub[]} stops
 * @param {Origin} origin
 * @returns {{legs: {pub: Pub, legMiles: number}[], returnMiles: number}}
 */
function computeCrawlLegs(stops, origin) {
  const legs = [];
  let current = { lat: origin.lat, lon: origin.lon };
  for (const pub of stops) {
    legs.push({ pub, legMiles: haversineMiles(current.lat, current.lon, pub.lat, pub.lon) });
    current = pub;
  }
  const returnMiles = haversineMiles(current.lat, current.lon, origin.lat, origin.lon);
  return { legs, returnMiles };
}

/**
 * @param {Origin} origin
 * @param {Pub[]} stops
 * @returns {string} A Google Maps multi-stop walking directions URL, looping back to the start -- free, no API key.
 */
function buildCrawlDirectionsUrl(origin, stops) {
  const waypoints = stops.map((p) => `${p.lat},${p.lon}`).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lon}`,
    destination: `${origin.lat},${origin.lon}`,
    travelmode: "walking",
  });
  if (waypoints) params.set("waypoints", waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** @param {{randomize: boolean}} options */
function buildAndRenderCrawl({ randomize }) {
  if (!crawlOrigin || crawlCandidates.length === 0) return;

  const requestedStops = parseInt(crawlStopsInput.value, 10);
  const maxLegMiles = parseFloat(crawlMaxLegInput.value);

  // Pinned stops are always kept; only the remaining slots go through
  // selectCrawlStops (deterministic or shuffled). If more stops are pinned
  // than requested, the pins win -- shrinking below what's already locked
  // in would mean silently un-pinning something the user asked to keep.
  const locked = crawlCandidates.filter((p) => lockedStopKeys.has(pubKey(p)));
  const unlocked = crawlCandidates.filter((p) => !lockedStopKeys.has(pubKey(p)));
  const stopCount = Math.max(Math.min(requestedStops, crawlCandidates.length), locked.length);
  const remainingSlots = stopCount - locked.length;

  const additional =
    remainingSlots > 0 ? selectCrawlStops(unlocked, crawlOrigin, remainingSlots, maxLegMiles, randomize) : [];

  const chosen = [...locked, ...additional];
  const ordered = bestCircularOrder(chosen, crawlOrigin, maxLegMiles);
  const { legs, returnMiles } = computeCrawlLegs(ordered, crawlOrigin);

  renderCrawlRoute(legs, returnMiles, maxLegMiles);

  crawlOriginLabelEl.textContent = `Starting from ${crawlOrigin.label}`;
  if (chosen.length < requestedStops) {
    setCrawlStatus(`Only found ${chosen.length} pub${chosen.length === 1 ? "" : "s"} nearby.`);
  } else if (chosen.length > requestedStops) {
    setCrawlStatus(`Showing ${chosen.length} stops — more than ${requestedStops} pubs are pinned.`);
  } else {
    setCrawlStatus("");
  }
  crawlResultEl.classList.remove("hidden");
}

/**
 * @param {HTMLButtonElement} btn
 * @param {Pub} pub
 * @param {boolean} locked
 */
function updateCrawlLockBtn(btn, pub, locked) {
  btn.classList.toggle("active", locked);
  btn.setAttribute("aria-pressed", String(locked));
  btn.setAttribute("aria-label", `${locked ? "Unpin" : "Pin"} ${pub.name} so shuffling keeps it`);
}

/**
 * @param {{pub: Pub, legMiles: number}[]} legs
 * @param {number} returnMiles
 * @param {number} maxLegMiles
 */
function renderCrawlRoute(legs, returnMiles, maxLegMiles) {
  crawlRouteListEl.innerHTML = "";
  let totalMiles = 0;

  legs.forEach((leg, index) => {
    totalMiles += leg.legMiles;

    const key = pubKey(leg.pub);
    const li = document.createElement("li");
    li.classList.toggle("locked", lockedStopKeys.has(key));

    const num = document.createElement("span");
    num.className = "crawl-stop-num";
    num.textContent = String(index + 1);

    const info = document.createElement("span");
    info.className = "crawl-stop-info";
    const name = document.createElement("span");
    name.className = "pub-list-name";
    name.textContent = leg.pub.name;
    const legInfo = document.createElement("span");
    legInfo.className = "pub-list-address";
    legInfo.textContent = `${leg.legMiles.toFixed(2)} mi from ${
      index === 0 ? "start" : "previous stop"
    } · ~${formatWalkTime(leg.legMiles)}`;
    if (leg.legMiles > maxLegMiles) {
      legInfo.textContent += " · ";
      const warning = document.createElement("span");
      warning.className = "crawl-leg-warning";
      warning.textContent = "further than your walk limit";
      legInfo.appendChild(warning);
    }
    info.appendChild(name);
    info.appendChild(legInfo);

    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.className = "crawl-lock-btn";
    lockBtn.textContent = "📌";
    updateCrawlLockBtn(lockBtn, leg.pub, lockedStopKeys.has(key));
    lockBtn.addEventListener("click", () => {
      if (lockedStopKeys.has(key)) lockedStopKeys.delete(key);
      else lockedStopKeys.add(key);
      const nowLocked = lockedStopKeys.has(key);
      li.classList.toggle("locked", nowLocked);
      updateCrawlLockBtn(lockBtn, leg.pub, nowLocked);
    });

    const banStopBtn = document.createElement("button");
    banStopBtn.type = "button";
    banStopBtn.className = "crawl-ban-btn";
    banStopBtn.textContent = "🚫";
    banStopBtn.setAttribute("aria-label", `Ban ${leg.pub.name} so it never appears again`);
    banStopBtn.addEventListener("click", () => {
      banPub(leg.pub);
      crawlCandidates = crawlCandidates.filter((p) => pubKey(p) !== key);
      lockedStopKeys.delete(key);
      buildAndRenderCrawl({ randomize: false });
    });

    li.appendChild(num);
    li.appendChild(info);
    li.appendChild(lockBtn);
    li.appendChild(banStopBtn);
    crawlRouteListEl.appendChild(li);
  });

  totalMiles += returnMiles;

  const returnLi = document.createElement("li");
  returnLi.className = "crawl-return-row";
  const returnNum = document.createElement("span");
  returnNum.className = "crawl-stop-num crawl-stop-num-return";
  returnNum.textContent = "🏁";
  const returnInfo = document.createElement("span");
  returnInfo.className = "crawl-stop-info";
  const returnName = document.createElement("span");
  returnName.className = "pub-list-name";
  returnName.textContent = "Back to start";
  const returnLeg = document.createElement("span");
  returnLeg.className = "pub-list-address";
  returnLeg.textContent = `${returnMiles.toFixed(2)} mi · ~${formatWalkTime(returnMiles)}`;
  if (returnMiles > maxLegMiles) {
    returnLeg.textContent += " · ";
    const warning = document.createElement("span");
    warning.className = "crawl-leg-warning";
    warning.textContent = "further than your walk limit";
    returnLeg.appendChild(warning);
  }
  returnInfo.appendChild(returnName);
  returnInfo.appendChild(returnLeg);
  returnLi.appendChild(returnNum);
  returnLi.appendChild(returnInfo);
  crawlRouteListEl.appendChild(returnLi);

  crawlRouteSummaryEl.textContent = `${legs.length} stops · ${totalMiles.toFixed(
    2
  )} miles round trip · ~${formatWalkTime(totalMiles)} walking total`;

  const stops = legs.map((l) => l.pub);
  crawlDirectionsLink.href = buildCrawlDirectionsUrl(/** @type {Origin} */ (crawlOrigin), stops);
  renderCrawlMap(/** @type {Origin} */ (crawlOrigin), stops);
}

/**
 * @param {Origin} origin
 * @param {Pub[]} stops
 */
function renderCrawlMap(origin, stops) {
  if (!crawlMap) {
    crawlMap = L.map("crawl-map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(crawlMap);
  }

  for (const layer of crawlMapLayers) layer.remove();
  crawlMapLayers = [];

  // Origin appears at both ends so the polyline visually closes the loop.
  const points = [[origin.lat, origin.lon], ...stops.map((p) => [p.lat, p.lon]), [origin.lat, origin.lon]];

  const startMarker = L.circleMarker([origin.lat, origin.lon], {
    radius: 8,
    color: "#2b2118",
    fillColor: "#fff",
    fillOpacity: 1,
    weight: 2,
  }).bindPopup("Start");
  startMarker.addTo(crawlMap);
  crawlMapLayers.push(startMarker);

  stops.forEach((pub, index) => {
    const icon = L.divIcon({
      className: "crawl-marker",
      html: `<span>${index + 1}</span>`,
      iconSize: [26, 26],
    });
    const stopMarker = L.marker([pub.lat, pub.lon], { icon }).bindPopup(pub.name);
    stopMarker.addTo(crawlMap);
    crawlMapLayers.push(stopMarker);
  });

  const line = L.polyline(points, { color: "#a2361b", weight: 3, dashArray: "6 6" }).addTo(crawlMap);
  crawlMapLayers.push(line);

  crawlMap.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  setTimeout(() => crawlMap.invalidateSize(), 100);
}

/** @param {Pub} pub */
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

/**
 * @param {BannedPub} pub
 * @returns {string}
 */
function pubKey(pub) {
  return `${pub.name}|${pub.lat}|${pub.lon}`;
}

/** @returns {Pub[]} */
function getFavourites() {
  try {
    return JSON.parse(localStorage.getItem(FAVOURITES_KEY)) || [];
  } catch {
    return [];
  }
}

/** @param {Pub[]} favourites */
function saveFavourites(favourites) {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));
  } catch {
    // localStorage unavailable (private browsing, full quota, etc.) -- the
    // star toggle just won't persist, nothing else in the app depends on it.
  }
}

/**
 * @param {Pub} pub
 * @returns {boolean}
 */
function isFavourite(pub) {
  const key = pubKey(pub);
  return getFavourites().some((p) => pubKey(p) === key);
}

/** @param {Pub} pub */
function toggleFavourite(pub) {
  const key = pubKey(pub);
  const favourites = getFavourites();
  const index = favourites.findIndex((p) => pubKey(p) === key);

  if (index >= 0) {
    favourites.splice(index, 1);
  } else {
    // Store only what's needed to redisplay this pub later -- distanceMiles
    // is specific to whatever search produced it and isn't meaningful once saved.
    favourites.push({
      name: pub.name,
      lat: pub.lat,
      lon: pub.lon,
      address: pub.address,
      operator: pub.operator || "",
      website: pub.website || "",
      phone: pub.phone || "",
      openingHours: pub.openingHours || "",
      wikipedia: pub.wikipedia || "",
      beerGarden: Boolean(pub.beerGarden),
      dogFriendly: Boolean(pub.dogFriendly),
      foodServed: Boolean(pub.foodServed),
      wheelchair: pub.wheelchair || "",
      realAle: Boolean(pub.realAle),
      paymentCash: Boolean(pub.paymentCash),
      paymentCardYes: Boolean(pub.paymentCardYes),
      paymentCardNo: Boolean(pub.paymentCardNo),
      description: pub.description || "",
      image: pub.image || "",
      listedStatus: pub.listedStatus || "",
      startDate: pub.startDate || "",
      darts: Boolean(pub.darts),
      pool: Boolean(pub.pool),
      nearSea: Boolean(pub.nearSea),
    });
  }

  saveFavourites(favourites);
  updateFavouritesBadge();
  if (!favouritesView.classList.contains("hidden")) renderFavouritesView();
}

/** @param {Pub} pub */
function updateFavouriteButtonState(pub) {
  const saved = isFavourite(pub);
  favouriteBtn.textContent = saved ? "★ Saved" : "☆ Save";
  favouriteBtn.setAttribute("aria-pressed", String(saved));
}

function updateFavouritesBadge() {
  const count = getFavourites().length;
  favouritesCountEl.textContent = String(count);
  favouritesCountEl.classList.toggle("hidden", count === 0);
}

function renderFavouritesView() {
  const favourites = getFavourites();
  favouritesListEl.innerHTML = "";
  favouritesEmptyEl.classList.toggle("hidden", favourites.length > 0);

  for (const pub of favourites) {
    const li = document.createElement("li");

    const info = document.createElement("span");
    const name = document.createElement("span");
    name.className = "pub-list-name";
    name.textContent = pub.name;

    const openStatus = getOpenStatus(pub.openingHours);
    if (openStatus) {
      const dot = document.createElement("span");
      dot.className = `open-dot ${openStatus}`;
      dot.title = openStatus === "open" ? "Open now" : "Closed now";
      name.appendChild(dot);
    }

    const address = document.createElement("span");
    address.className = "pub-list-address";
    address.textContent = pub.operator ? `${pub.address} · ${pub.operator}` : pub.address;
    info.appendChild(name);
    info.appendChild(address);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pub-list-remove";
    removeBtn.setAttribute("aria-label", `Remove ${pub.name} from favourites`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavourite(pub);
    });

    li.appendChild(info);
    li.appendChild(removeBtn);
    li.addEventListener("click", () => {
      switchView("search");
      showPub(pub);
    });

    favouritesListEl.appendChild(li);
  }
}

// A pub the user never wants to see again, in search results or crawl
// candidates. Stored minimally (just enough for pubKey matching and to
// show a name in the manage list), same shape/rationale as favourites.
/** @returns {BannedPub[]} */
function getBannedPubs() {
  try {
    return JSON.parse(localStorage.getItem(BANNED_PUBS_KEY)) || [];
  } catch {
    return [];
  }
}

/** @param {BannedPub[]} banned */
function saveBannedPubs(banned) {
  try {
    localStorage.setItem(BANNED_PUBS_KEY, JSON.stringify(banned));
  } catch {
    // ignore -- banning just won't persist across visits
  }
}

/** @param {Pub} pub */
function banPub(pub) {
  const key = pubKey(pub);
  const banned = getBannedPubs();
  if (banned.some((p) => pubKey(p) === key)) return;
  banned.push({ name: pub.name, lat: pub.lat, lon: pub.lon });
  saveBannedPubs(banned);
  if (!favouritesView.classList.contains("hidden")) renderBannedListView();
}

/** @param {BannedPub} pub */
function unbanPub(pub) {
  const key = pubKey(pub);
  saveBannedPubs(getBannedPubs().filter((p) => pubKey(p) !== key));
  if (!favouritesView.classList.contains("hidden")) renderBannedListView();
}

/**
 * @param {Pub[]} pubs
 * @returns {Pub[]}
 */
function excludeBannedPubs(pubs) {
  const banned = getBannedPubs();
  if (banned.length === 0) return pubs;
  const bannedKeys = new Set(banned.map(pubKey));
  return pubs.filter((pub) => !bannedKeys.has(pubKey(pub)));
}

function renderBannedListView() {
  const banned = getBannedPubs();
  bannedListEl.innerHTML = "";
  bannedHeadingEl.classList.toggle("hidden", banned.length === 0);
  bannedListEl.classList.toggle("hidden", banned.length === 0);

  for (const pub of banned) {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "pub-list-name";
    name.textContent = pub.name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pub-list-remove";
    removeBtn.setAttribute("aria-label", `Unban ${pub.name}`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      unbanPub(pub);
    });

    li.appendChild(name);
    li.appendChild(removeBtn);
    bannedListEl.appendChild(li);
  }
}

/** @param {"search"|"crawl"|"favourites"} view */
function switchView(view) {
  searchView.classList.toggle("hidden", view !== "search");
  crawlView.classList.toggle("hidden", view !== "crawl");
  favouritesView.classList.toggle("hidden", view !== "favourites");
  tabSearchBtn.classList.toggle("active", view === "search");
  tabCrawlBtn.classList.toggle("active", view === "crawl");
  tabFavouritesBtn.classList.toggle("active", view === "favourites");
  tabSearchBtn.setAttribute("aria-selected", String(view === "search"));
  tabCrawlBtn.setAttribute("aria-selected", String(view === "crawl"));
  tabFavouritesBtn.setAttribute("aria-selected", String(view === "favourites"));
  if (view === "favourites") {
    renderFavouritesView();
    renderBannedListView();
  }
}

// Keeps a postcode search bookmarkable/shareable without touching browser
// history on every search (replaceState, not pushState). Geolocation-based
// searches deliberately don't get encoded here -- see runLocationSearch().
function updateUrlForSearch(postcode, radiusMiles) {
  const params = new URLSearchParams();
  params.set("postcode", postcode);
  params.set("radius", radiusMiles);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

function loadSearchFromUrl() {
  const params = new URLSearchParams(location.search);
  const postcode = params.get("postcode");
  if (!postcode) return;

  const radius = parseFloat(params.get("radius"));
  const minRadius = parseFloat(radiusInput.min);
  const maxRadius = parseFloat(radiusInput.max);

  postcodeInput.value = postcode;
  if (!Number.isNaN(radius) && radius >= minRadius && radius <= maxRadius) {
    radiusInput.value = String(radius);
    radiusValue.textContent = String(radius);
  }

  runSearch();
}

/** @returns {{postcode: string, radiusMiles: number}[]} */
function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * @param {string} postcode
 * @param {number} radiusMiles
 */
function recordRecentSearch(postcode, radiusMiles) {
  const normalised = postcode.trim().toUpperCase();
  let recent = getRecentSearches().filter((entry) => entry.postcode !== normalised);
  recent.unshift({ postcode: normalised, radiusMiles });
  recent = recent.slice(0, RECENT_SEARCHES_MAX);

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
  } catch {
    // ignore -- chips just won't persist
  }

  // Track which search is actually on screen so the matching chip can be
  // marked -- previously nothing indicated which of several recent
  // postcodes you were currently looking at.
  currentSearchKey = `${normalised}|${radiusMiles}`;
  renderRecentSearches();
}

function renderRecentSearches() {
  const recent = getRecentSearches();
  recentSearchesEl.innerHTML = "";
  recentSearchesEl.classList.toggle("hidden", recent.length === 0);

  for (const entry of recent) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${entry.postcode} · ${entry.radiusMiles}mi`;
    btn.classList.toggle("active", `${entry.postcode}|${entry.radiusMiles}` === currentSearchKey);
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
    btn.addEventListener("click", () => {
      postcodeInput.value = entry.postcode;
      radiusInput.value = String(entry.radiusMiles);
      radiusValue.textContent = String(entry.radiusMiles);
      runSearch();
    });
    recentSearchesEl.appendChild(btn);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed", err));
}

// Shows when the shipped dataset was last regenerated from OpenStreetMap,
// so staleness is visible rather than silently assumed away. Sourced from a
// small file build-pubs-data.mjs writes alongside pubs-gb.json every time
// it runs, not a hardcoded date that would drift out of sync.
async function loadDataFreshness() {
  const res = await fetch("data/pubs-meta.json");
  if (!res.ok) return;
  const meta = await res.json();
  if (!meta.updatedAt) return;

  const formatted = new Date(meta.updatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const pubCount = typeof meta.pubCount === "number" ? meta.pubCount.toLocaleString("en-GB") : null;
  dataFreshnessEl.textContent = pubCount
    ? `Pub data last updated ${formatted} · ${pubCount} pubs`
    : `Pub data last updated ${formatted}`;
  dataFreshnessEl.classList.remove("hidden");
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "auto";
  } catch {
    return "auto";
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore -- the toggle just won't persist across visits
  }
}

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  themeToggleBtn.textContent = theme === "light" ? "☀️ Light" : theme === "dark" ? "🌙 Dark" : "🌓 Auto";
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.textContent = busy ? "Searching…" : "Find me a pub";
  locationBtn.disabled = busy;
}
