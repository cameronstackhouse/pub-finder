const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

// Regression test for a real bug: #crawl-view was styled with an ID
// selector, which beat the .hidden class selector on specificity
// regardless of source order, so the crawl view never actually hid and
// stayed rendered on top of every other tab (see git history around the
// "CSS specificity bug" fix). This asserts exactly one view is rendered
// at a time, for every pairwise tab transition -- including the Map tab
// added later, since it's the same class of bug that could recur for any
// new view.
test("exactly one of Search/Map/Crawl/Favourites is visible at a time", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");

  async function visibleViews() {
    return {
      search: await page.isVisible("#search-view"),
      map: await page.isVisible("#map-view"),
      crawl: await page.isVisible("#crawl-view"),
      favourites: await page.isVisible("#favourites-view"),
    };
  }

  await expect.poll(visibleViews).toEqual({ search: true, map: false, crawl: false, favourites: false });

  await page.click("#tab-map");
  await expect.poll(visibleViews).toEqual({ search: false, map: true, crawl: false, favourites: false });

  await page.click("#tab-crawl");
  await expect.poll(visibleViews).toEqual({ search: false, map: false, crawl: true, favourites: false });

  await page.click("#tab-favourites");
  await expect.poll(visibleViews).toEqual({ search: false, map: false, crawl: false, favourites: true });

  await page.click("#tab-search");
  await expect.poll(visibleViews).toEqual({ search: true, map: false, crawl: false, favourites: false });

  // Every ordered pair, not just a round trip -- the bug only showed up
  // once a specific element had "hidden" toggled off then back on, and
  // different transition orders exercise that differently.
  const tabs = ["#tab-search", "#tab-map", "#tab-crawl", "#tab-favourites"];
  const viewKeys = ["search", "map", "crawl", "favourites"];
  for (let i = 0; i < tabs.length; i++) {
    for (let j = 0; j < tabs.length; j++) {
      await page.click(tabs[i]);
      await page.click(tabs[j]);
      const state = await visibleViews();
      const expected = { search: false, map: false, crawl: false, favourites: false };
      expected[viewKeys[j]] = true;
      expect(state, `${tabs[i]} -> ${tabs[j]}`).toEqual(expected);
    }
  }
});

test("tab buttons reflect active state via aria-selected", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");

  await expect(page.locator("#tab-search")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#tab-map")).toHaveAttribute("aria-selected", "false");

  await page.click("#tab-map");
  await expect(page.locator("#tab-search")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#tab-map")).toHaveAttribute("aria-selected", "true");
});
