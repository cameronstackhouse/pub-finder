const { test, expect } = require("@playwright/test");
const { mockApp } = require("./fixtures");

// Full-width row matching what build-pubs-data.mjs emits; the options
// object supplies the trailing tap-related columns.
function pubRow(
  name,
  lat,
  lon,
  {
    breweries = "",
    microbrewery = "",
    realCider = "",
    rotatingTaps = "",
    realAle = "",
    realAlePumps = "",
    menuUrl = "",
    untappdUrl = "",
  } = {}
) {
  return [
    name,
    lat,
    lon,
    "1 Test Street, London",
    "", // operator
    "", // website
    "", // phone
    "", // openingHours
    "", // wikipedia
    "", // beerGarden
    "", // dogFriendly
    "", // foodServed
    "", // wheelchair
    realAle,
    "", // paymentCash
    "", // paymentCardYes
    "", // paymentCardNo
    "", // description
    "", // image
    "", // listedStatus
    "", // startDate
    "", // darts
    "", // pool
    "", // nearSea
    breweries,
    microbrewery,
    realCider,
    rotatingTaps,
    realAlePumps,
    menuUrl,
    untappdUrl,
  ];
}

/** Reads the "Tell me more" definition list into a {label: value} object. */
async function readFacts(page) {
  return page.evaluate(() => {
    const dl = document.getElementById("more-info-facts");
    const facts = {};
    const dts = [...dl.querySelectorAll("dt")];
    const dds = [...dl.querySelectorAll("dd")];
    dts.forEach((dt, i) => {
      facts[dt.textContent] = dds[i] ? dds[i].textContent : "";
    });
    return facts;
  });
}

async function openFirstPub(page, rows) {
  await mockApp(page);
  await page.route("**/data/pubs-gb.json*", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await page.goto("/");
  await page.fill("#postcode", "SW1A 1AA");
  await page.click("#submit-btn");
  await expect(page.locator("#result")).toBeVisible();
  await page.click("#more-info-btn");
  await expect(page.locator("#more-info")).toBeVisible();
}

test("named breweries show under On tap", async ({ page }) => {
  await openFirstPub(page, [pubRow("The Named Taps", 51.5074, -0.1278, { breweries: "Timothy Taylor; Adnams" })]);

  const facts = await readFacts(page);
  expect(facts["On tap"]).toBe("Timothy Taylor; Adnams");
});

// The honesty case: brewery=yes says a pub serves beer from some brewery
// without saying which, so it must not surface as "On tap: yes".
test("a pub tagged brewery=yes shows no On tap row at all", async ({ page }) => {
  // parseBreweries strips "yes" at build time, so the shipped column is
  // empty -- this asserts the app renders nothing rather than an empty row.
  await openFirstPub(page, [pubRow("The Yes Pub", 51.5074, -0.1278, { breweries: "" })]);

  const facts = await readFacts(page);
  expect(facts).not.toHaveProperty("On tap");
});

test("a guest/rotating selection is described as such", async ({ page }) => {
  await openFirstPub(page, [pubRow("The Guest House", 51.5074, -0.1278, { rotatingTaps: "1" })]);

  const facts = await readFacts(page);
  expect(facts["On tap"]).toBe("Guest / rotating beers");
});

test("named breweries and guest beers are reported together", async ({ page }) => {
  await openFirstPub(page, [
    pubRow("The Brewhouse", 51.5074, -0.1278, { breweries: "Brewhouse Ales", rotatingTaps: "1" }),
  ]);

  const facts = await readFacts(page);
  expect(facts["On tap"]).toBe("Brewhouse Ales · plus guest beers");
});

test("brewing on site and real cider appear as amenities", async ({ page }) => {
  await openFirstPub(page, [
    pubRow("The Brewhouse", 51.5074, -0.1278, { microbrewery: "1", realCider: "1", realAle: "1" }),
  ]);

  const facts = await readFacts(page);
  expect(facts["Amenities"]).toContain("Brews its own beer");
  expect(facts["Amenities"]).toContain("Real cider");
  expect(facts["Amenities"]).toContain("Real ale");
});

// The tap columns were appended to a dataset that had already shipped, so
// rows built before that are simply shorter. They must still load rather
// than throwing or mis-aligning fields.
test("a legacy 24-column dataset still loads and just omits tap info", async ({ page }) => {
  const legacyRow = pubRow("The Old Format", 51.5074, -0.1278).slice(0, 24);
  expect(legacyRow).toHaveLength(24);

  await openFirstPub(page, [legacyRow]);

  await expect(page.locator("#pub-name")).toHaveText("The Old Format");
  const facts = await readFacts(page);
  expect(facts).not.toHaveProperty("On tap");
});

test("a stated handpump count appears on the tap line", async ({ page }) => {
  await openFirstPub(page, [pubRow("Four Pumps", 51.5074, -0.1278, { realAle: "1", realAlePumps: "4" })]);

  const facts = await readFacts(page);
  expect(facts["On tap"]).toBe("4 real ale handpumps");
});

test("a single handpump is not pluralised", async ({ page }) => {
  await openFirstPub(page, [pubRow("One Pump", 51.5074, -0.1278, { realAle: "1", realAlePumps: "1" })]);

  const facts = await readFacts(page);
  expect(facts["On tap"]).toBe("1 real ale handpump");
});

test("breweries, guest beers and handpumps combine on one line", async ({ page }) => {
  await openFirstPub(page, [
    pubRow("The Lot", 51.5074, -0.1278, { breweries: "Harveys", rotatingTaps: "1", realAlePumps: "6" }),
  ]);

  const facts = await readFacts(page);
  expect(facts["On tap"]).toBe("Harveys · plus guest beers · 6 real ale handpumps");
});

// OSM has no usable data on which individual beers are pouring, so where
// it knows where the pub's own list lives, the app links out instead.
test("menu and Untappd links are shown with readable link text", async ({ page }) => {
  await openFirstPub(page, [
    pubRow("Linked Pub", 51.5074, -0.1278, {
      menuUrl: "https://example.com/a/very/long/menu/url/that/reads/badly",
      untappdUrl: "https://untappd.com/v/test/123",
    }),
  ]);

  const facts = await readFacts(page);
  expect(facts["Menu"]).toBe("View their menu");
  expect(facts["Live tap list"]).toBe("See what's on (Untappd)");

  await expect(page.locator('#more-info-facts a:has-text("View their menu")')).toHaveAttribute(
    "href",
    "https://example.com/a/very/long/menu/url/that/reads/badly"
  );
  await expect(page.locator('#more-info-facts a:has-text("Untappd")')).toHaveAttribute(
    "href",
    "https://untappd.com/v/test/123"
  );
});

test("a pub with no tap data at all shows none of these rows", async ({ page }) => {
  await openFirstPub(page, [pubRow("The Plain Pub", 51.5074, -0.1278)]);

  const facts = await readFacts(page);
  expect(facts).not.toHaveProperty("On tap");
  expect(facts).not.toHaveProperty("Menu");
  expect(facts).not.toHaveProperty("Live tap list");
});
