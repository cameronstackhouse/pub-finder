// Shared setup for the Playwright specs: stubs Leaflet (the real CDN build
// isn't worth depending on for deterministic tests), mocks postcodes.io,
// and serves a small fixed pub dataset instead of the real ~52k-row file so
// results are predictable and fast to assert on.

const ORIGIN = { lat: 51.5074, lon: -0.1278, postcode: "SW1A 1AA" };

/** @param {number} n */
function makeRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    // Spread pubs within roughly half a mile of the origin, alternating
    // amenity flags so filter-chip tests have something to narrow.
    const dLat = (((i * 37) % 100) - 50) * 0.0001;
    const dLon = (((i * 53) % 100) - 50) * 0.0001;
    rows.push([
      `Test Pub ${i + 1}`,
      ORIGIN.lat + dLat,
      ORIGIN.lon + dLon,
      `${i + 1} Test Street, London`,
      "",
      "",
      "",
      "",
      "",
      i % 2 === 0, // beerGarden
      i % 3 === 0, // dogFriendly
      i % 4 === 0, // foodServed
      "",
      false,
      false,
      false,
      false,
      "",
      "",
      "",
      "",
      false,
      false,
      false, // nearSea
    ]);
  }
  return rows;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ rowCount?: number }} [options]
 */
async function mockApp(page, { rowCount = 12 } = {}) {
  await page.addInitScript(() => {
    class FakeLayer {
      addTo() {
        return this;
      }
      remove() {
        return this;
      }
      bindPopup(content) {
        this._popupContent = content;
        return this;
      }
      openPopup() {
        return this;
      }
      closePopup() {
        return this;
      }
    }

    // Fake Leaflet.markercluster group: tracks which layers are currently
    // "added" (good enough to assert filter chips actually change what's
    // shown) and synchronously invokes chunkProgress the way the real
    // plugin eventually does, so app.js's completion-status logic runs
    // deterministically in tests instead of depending on real chunking.
    class FakeClusterGroup {
      constructor(options) {
        this._options = options || {};
        this._layers = [];
        window.__lastClusterGroup = this;
      }
      addTo() {
        return this;
      }
      addLayer(layer) {
        this._layers.push(layer);
        return this;
      }
      addLayers(layers) {
        this._layers.push(...layers);
        if (this._options.chunkProgress) this._options.chunkProgress(layers.length, layers.length, 0);
        return this;
      }
      clearLayers() {
        this._layers = [];
        if (this._options.chunkProgress) this._options.chunkProgress(0, 0, 0);
        return this;
      }
      removeLayer(layer) {
        this._layers = this._layers.filter((l) => l !== layer);
        return this;
      }
      getLayers() {
        return this._layers;
      }
    }

    // window.__mapCalls records setView() calls on any fake map instance so
    // tests can assert "jump to postcode"/"use my location" navigated
    // where expected without a real Leaflet map to inspect visually.
    window.__mapCalls = [];
    window.L = {
      map: () => ({
        setView(latlng, zoom) {
          window.__mapCalls.push({ latlng, zoom });
          return this;
        },
        invalidateSize() {},
        fitBounds() {},
      }),
      tileLayer: () => new FakeLayer(),
      marker: (latlng) => Object.assign(new FakeLayer(), { _latlng: latlng }),
      circleMarker: () => new FakeLayer(),
      polyline: () => new FakeLayer(),
      divIcon: (opts) => opts,
      latLngBounds: (pts) => pts,
      markerClusterGroup: (options) => new FakeClusterGroup(options),
    };
  });

  await page.route("https://api.postcodes.io/postcodes/*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { latitude: ORIGIN.lat, longitude: ORIGIN.lon, postcode: ORIGIN.postcode } }),
    });
  });

  await page.route("**/data/pubs-gb.json*", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeRows(rowCount)) });
  });

  await page.route("**/data/pubs-meta.json*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updatedAt: "2026-03-01T00:00:00.000Z", pubCount: rowCount }),
    });
  });

  // The real vendored plugin extends L.FeatureGroup at load time, which
  // only exists on a real Leaflet build -- our fake L already provides
  // markerClusterGroup() directly, so serve an empty stub instead of
  // letting the real file crash trying to extend a class that isn't there.
  await page.route("**/vendor/leaflet.markercluster/**", (route) => {
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
}

module.exports = { mockApp, ORIGIN, makeRows };
