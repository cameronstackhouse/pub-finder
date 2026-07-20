const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

test("favourites tab shows an empty state with nothing saved", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.click("#tab-favourites");

  await expect(page.locator("#favourites-empty")).toBeVisible();
  await expect(page.locator("#favourites-list li")).toHaveCount(0);
  // No crawl content should leak through onto this tab (regression guard
  // for the ID-selector/.hidden specificity bug).
  await expect(page.locator("#crawl-form")).not.toBeVisible();
});

test("clicking a saved favourite switches to Search and shows that pub", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();
  const name = await page.locator("#pub-name").textContent();
  await page.click("#favourite-btn");

  await page.click("#tab-favourites");
  await page.click("#favourites-list li");

  await expect(page.locator("#search-view")).toBeVisible();
  await expect(page.locator("#pub-name")).toHaveText(name);
});

test("removing a favourite via the x button updates the list and badge", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();
  await page.click("#favourite-btn");

  await page.click("#tab-favourites");
  await expect(page.locator("#favourites-list li")).toHaveCount(1);

  await page.click("#favourites-list li .pub-list-remove");
  await expect(page.locator("#favourites-list li")).toHaveCount(0);
  await expect(page.locator("#favourites-empty")).toBeVisible();
  await expect(page.locator("#favourites-count")).toBeHidden();
});

test("unbanning a pub via the banned list removes it and it can reappear in results", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();
  const bannedName = await page.locator("#pub-name").textContent();
  await page.click("#ban-btn");

  await page.click("#tab-favourites");
  await expect(page.locator("#banned-list li .pub-list-name")).toHaveText(bannedName);

  await page.click("#banned-list li .pub-list-remove");
  await expect(page.locator("#banned-heading")).toBeHidden();
  await expect(page.locator("#banned-list li")).toHaveCount(0);

  await page.click("#tab-search");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();
  const names = await page.locator("#pub-list li .pub-list-name").allTextContents();
  expect(names).toContain(bannedName);
});
