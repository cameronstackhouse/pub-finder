const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

test("Tell me more shows an OpenStreetMap edit link for the shown pub", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();

  await page.click("#more-info-btn");
  const link = page.locator("#osm-edit-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /^https:\/\/www\.openstreetmap\.org\/edit#map=19\//);
});
