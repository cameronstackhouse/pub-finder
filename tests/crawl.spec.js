const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

async function planCrawl(page) {
  await mockApp(page);
  await page.goto("/");
  await page.click("#tab-crawl");
  await page.fill("#crawl-postcode", "SW1A 1AA");
  await page.click("#crawl-submit-btn");
  await expect(page.locator("#crawl-result")).toBeVisible();
}

test("planning a crawl builds a route with the requested stop count and a return leg", async ({ page }) => {
  await planCrawl(page);

  const stops = page.locator("#crawl-route-list li:not(.crawl-return-row)");
  await expect(stops).toHaveCount(4); // default "Number of pubs" slider value

  await expect(page.locator("#crawl-route-list li.crawl-return-row")).toHaveCount(1);
  await expect(page.locator("#crawl-route-list li.crawl-return-row .pub-list-name")).toHaveText("Back to start");
  await expect(page.locator("#crawl-route-summary")).toContainText("4 stops");
});

test("changing the stop count slider live-updates the route", async ({ page }) => {
  await planCrawl(page);

  await page.evaluate(() => {
    const input = document.getElementById("crawl-stops");
    input.value = "6";
    input.dispatchEvent(new Event("input"));
  });

  await expect(page.locator("#crawl-route-list li:not(.crawl-return-row)")).toHaveCount(6);
});

test("pinning a stop keeps it through a shuffle", async ({ page }) => {
  await planCrawl(page);

  const firstStopName = await page.locator("#crawl-route-list li:not(.crawl-return-row)").first().locator(".pub-list-name").textContent();
  await page.locator("#crawl-route-list li:not(.crawl-return-row)").first().locator(".crawl-lock-btn").click();
  await expect(page.locator("#crawl-route-list li:not(.crawl-return-row)").first().locator(".crawl-lock-btn")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  for (let i = 0; i < 5; i++) {
    await page.click("#shuffle-crawl-btn");
    const names = await page.locator("#crawl-route-list li:not(.crawl-return-row) .pub-list-name").allTextContents();
    expect(names, `shuffle ${i + 1} should keep the pinned stop`).toContain(firstStopName);
  }
});

test("banning a crawl stop removes it and it never reappears on shuffle", async ({ page }) => {
  await planCrawl(page);

  const bannedName = await page.locator("#crawl-route-list li:not(.crawl-return-row)").first().locator(".pub-list-name").textContent();
  await page.locator("#crawl-route-list li:not(.crawl-return-row)").first().locator(".crawl-ban-btn").click();

  let names = await page.locator("#crawl-route-list li:not(.crawl-return-row) .pub-list-name").allTextContents();
  expect(names).not.toContain(bannedName);

  for (let i = 0; i < 5; i++) {
    await page.click("#shuffle-crawl-btn");
    names = await page.locator("#crawl-route-list li:not(.crawl-return-row) .pub-list-name").allTextContents();
    expect(names, `shuffle ${i + 1} should not bring back a banned stop`).not.toContain(bannedName);
  }
});

test("a filter chip narrows the crawl to only matching pubs", async ({ page }) => {
  await planCrawl(page);

  await page.click('#crawl-filter-chips button[data-filter="beerGarden"]');
  await expect(page.locator('#crawl-filter-chips button[data-filter="beerGarden"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const names = await page.locator("#crawl-route-list li:not(.crawl-return-row) .pub-list-name").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    const n = Number(name.match(/\d+/)[0]);
    expect((n - 1) % 2, `${name} should have a beer garden`).toBe(0);
  }
});

test("no route leg (including the return) exceeds the max-walk limit when a legal ordering exists", async ({
  page,
}) => {
  await planCrawl(page);

  // Fixture pubs are clustered tightly (well within the default 0.5mi
  // limit), so a fully compliant loop should always be findable --
  // regression guard for the bestCircularOrder ordering bug.
  await expect(page.locator(".crawl-leg-warning")).toHaveCount(0);

  for (let i = 0; i < 4; i++) {
    await page.click("#shuffle-crawl-btn");
    await expect(page.locator(".crawl-leg-warning")).toHaveCount(0);
  }
});
