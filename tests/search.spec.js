const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

test("searching a postcode shows a result and the full pub list", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");

  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");

  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#pub-name")).not.toBeEmpty();

  const items = await page.locator("#pub-list li").count();
  expect(items).toBeGreaterThan(0);
});

test("reroll shows a different pub without a new search", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();

  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    seen.add(await page.locator("#pub-name").textContent());
    await page.click("#reroll-btn");
  }
  // With 12 candidate pubs and 10 rerolls, seeing only one name back would
  // indicate the pool isn't actually varying.
  expect(seen.size).toBeGreaterThan(1);
});

test("filter chip narrows the pub list to matching pubs only", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");

  // Filter chips on the Search tab apply to the *next* search, not live
  // re-filtering of an already-shown list (unlike the Crawl tab's chips,
  // which do live-refilter) -- so toggle it before submitting.
  await page.click('#filter-chips button[data-filter="beerGarden"]');
  await expect(page.locator("#filter-chips button[data-filter=\"beerGarden\"]")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();

  const names = await page.locator("#pub-list li .pub-list-name").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  // Fixture data: beerGarden is true for even-indexed pubs (1-based names
  // "Test Pub 1", "Test Pub 3", ... are index 0, 2, ... => odd pub numbers).
  for (const name of names) {
    const n = Number(name.match(/\d+/)[0]);
    expect((n - 1) % 2, `${name} should have a beer garden`).toBe(0);
  }
});

test("favouriting a pub persists across a reload", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();

  const name = await page.locator("#pub-name").textContent();
  await page.click("#favourite-btn");
  await expect(page.locator("#favourite-btn")).toHaveText(/Saved/);

  await page.reload();
  await page.click("#tab-favourites");
  await expect(page.locator("#favourites-list li .pub-list-name")).toHaveText(name);
});

test("banning a pub removes it from the pool and from future results", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();

  const beforeCount = await page.locator("#pub-list li").count();
  const bannedName = await page.locator("#pub-name").textContent();
  await page.click("#ban-btn");

  const afterCount = await page.locator("#pub-list li").count();
  expect(afterCount).toBe(beforeCount - 1);

  const remainingNames = await page.locator("#pub-list li .pub-list-name").allTextContents();
  expect(remainingNames).not.toContain(bannedName);

  await page.click("#tab-favourites");
  await expect(page.locator("#banned-list li .pub-list-name")).toHaveText(bannedName);
});
