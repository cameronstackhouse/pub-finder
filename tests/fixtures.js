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
      bindPopup() {
        return this;
      }
      openPopup() {
        return this;
      }
    }
    window.L = {
      map: () => ({ setView() {}, invalidateSize() {}, fitBounds() {} }),
      tileLayer: () => new FakeLayer(),
      marker: () => new FakeLayer(),
      circleMarker: () => new FakeLayer(),
      polyline: () => new FakeLayer(),
      divIcon: (opts) => opts,
      latLngBounds: (pts) => pts,
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
}

module.exports = { mockApp, ORIGIN, makeRows };
