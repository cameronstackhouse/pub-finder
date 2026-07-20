const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

test("footer shows the data freshness note from pubs-meta.json", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");

  const freshness = page.locator("#data-freshness");
  await expect(freshness).toBeVisible();
  await expect(freshness).toContainText("1 March 2026");
  await expect(freshness).toContainText("12 pubs");
});
