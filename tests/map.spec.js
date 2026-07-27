const { test, expect } = require("@playwright/test");
const { mockApp, ORIGIN } = require("./fixtures");

test.use({ geolocation: { latitude: 51.51, longitude: -0.13 }, permissions: ["geolocation"] });

test("Map tab loads pubs into the cluster group and shows a count", async ({ page }) => {
  await mockApp(page, { rowCount: 20 });
  await page.goto("/");

  await page.click("#tab-map");
  await expect(page.locator("#map-view")).toBeVisible();
  await expect(page.locator("#map-status")).toHaveText("Showing 20 pubs");

  const layerCount = await page.evaluate(() => window.__lastClusterGroup.getLayers().length);
  expect(layerCount).toBe(20);
});

test("OSM node/way duplicates (same name, near-identical coordinates) collapse to one marker", async ({ page }) => {
  await mockApp(page);
  // Override the dataset with a deliberate duplicate pair, matching a real
  // one found in production ("Victoria Inn", TR3 6BY -- two OSM entries
  // ~1m apart), plus one genuinely distinct pub.
  await page.route("**/data/pubs-gb.json*", (route) => {
    const dupeRow = (lat, lon) => [
      "Victoria Inn",
      lat,
      lon,
      "Chyvelah Road, Truro, TR3 6BY",
      "",
      "",
      "",
      "",
      "",
      false,
      false,
      false,
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
      false,
    ];
    const rows = [
      dupeRow(50.26337, -5.11344),
      dupeRow(50.26338, -5.11345),
      ["Distinct Pub", 51.0, -1.0, "1 Other St", "", "", "", "", "", false, false, false, "", false, false, false, false, "", "", "", "", false, false, false],
    ];
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await page.goto("/");
  await page.click("#tab-map");
  await expect(page.locator("#map-status")).toHaveText("Showing 2 pubs");

  const layerCount = await page.evaluate(() => window.__lastClusterGroup.getLayers().length);
  expect(layerCount).toBe(2);
});

test("switching to another tab and back doesn't rebuild the map or duplicate markers", async ({ page }) => {
  await mockApp(page, { rowCount: 15 });
  await page.goto("/");

  await page.click("#tab-map");
  await expect(page.locator("#map-status")).toHaveText("Showing 15 pubs");

  await page.click("#tab-search");
  await page.click("#tab-map");
  await page.waitForTimeout(50);

  const layerCount = await page.evaluate(() => window.__lastClusterGroup.getLayers().length);
  expect(layerCount).toBe(15);
});

test("a filter chip narrows the markers shown on the map", async ({ page }) => {
  await mockApp(page, { rowCount: 20 });
  await page.goto("/");
  await page.click("#tab-map");
  await expect(page.locator("#map-status")).toHaveText("Showing 20 pubs");

  await page.click('#map-filter-chips button[data-filter="beerGarden"]');
  await expect(page.locator('#map-filter-chips button[data-filter="beerGarden"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // Fixture data: beerGarden is true for even-indexed pubs -> half of 20.
  await expect(page.locator("#map-status")).toHaveText("Showing 10 pubs");
  const layerCount = await page.evaluate(() => window.__lastClusterGroup.getLayers().length);
  expect(layerCount).toBe(10);
});

test("jumping to a postcode geocodes it and re-centres the map", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.click("#tab-map");
  await expect(page.locator("#map-status")).toContainText("Showing");

  await page.fill("#map-postcode", "SW1A 1AA");
  await page.click("#map-postcode-btn");
  await page.waitForTimeout(50);

  const calls = await page.evaluate(() => window.__mapCalls);
  const last = calls[calls.length - 1];
  expect(last.latlng).toEqual([ORIGIN.lat, ORIGIN.lon]);
  expect(last.zoom).toBe(15);
});

test("using my location re-centres the map to the browser's geolocation", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.click("#tab-map");
  await expect(page.locator("#map-status")).toContainText("Showing");

  await page.click("#map-location-btn");
  await page.waitForTimeout(50);

  const calls = await page.evaluate(() => window.__mapCalls);
  const last = calls[calls.length - 1];
  expect(last.latlng[0]).toBeCloseTo(51.51, 2);
  expect(last.latlng[1]).toBeCloseTo(-0.13, 2);
});

test("banning a pub via the search tab removes it from the map's markers too", async ({ page }) => {
  await mockApp(page, { rowCount: 12 });
  await page.goto("/");

  await page.click("#tab-map");
  await expect(page.locator("#map-status")).toHaveText("Showing 12 pubs");

  await page.click("#tab-search");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();
  await page.click("#ban-btn");

  const layerCount = await page.evaluate(() => window.__lastClusterGroup.getLayers().length);
  expect(layerCount).toBe(11);
});
