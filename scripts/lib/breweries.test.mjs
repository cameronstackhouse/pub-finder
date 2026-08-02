import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBreweries, MAX_BREWERY_NAMES } from "./breweries.mjs";

test("returns nothing for an absent or empty tag", () => {
  assert.deepEqual(parseBreweries(undefined), { names: "", rotating: false });
  assert.deepEqual(parseBreweries(""), { names: "", rotating: false });
  assert.deepEqual(parseBreweries("   "), { names: "", rotating: false });
});

test("keeps a single brewery name", () => {
  assert.deepEqual(parseBreweries("Timothy Taylor"), { names: "Timothy Taylor", rotating: false });
});

test("splits a semicolon-separated list", () => {
  assert.deepEqual(parseBreweries("Timothy Taylor;Adnams;Woodforde's"), {
    names: "Timothy Taylor; Adnams; Woodforde's",
    rotating: false,
  });
});

test("trims whitespace around names", () => {
  assert.equal(parseBreweries("  Adnams ;  Greene King  ").names, "Adnams; Greene King");
});

// The important honesty case: "yes" says a pub serves beer from *some*
// brewery, not which -- rendering it would read as "Brewery: yes".
test("drops bare yes/no/unknown rather than treating them as names", () => {
  assert.deepEqual(parseBreweries("yes"), { names: "", rotating: false });
  assert.deepEqual(parseBreweries("no"), { names: "", rotating: false });
  assert.deepEqual(parseBreweries("unknown"), { names: "", rotating: false });
  assert.equal(parseBreweries("yes;Adnams").names, "Adnams");
});

test("treats various/guest/rotating as a changing selection, not a brand", () => {
  assert.deepEqual(parseBreweries("various"), { names: "", rotating: true });
  assert.deepEqual(parseBreweries("guest beers"), { names: "", rotating: true });
  assert.deepEqual(parseBreweries("rotating"), { names: "", rotating: true });
});

test("reports both named breweries and a rotating selection together", () => {
  assert.deepEqual(parseBreweries("Timothy Taylor;guest"), {
    names: "Timothy Taylor",
    rotating: true,
  });
});

test("is case-insensitive when classifying non-name values", () => {
  assert.deepEqual(parseBreweries("YES;Various"), { names: "", rotating: true });
});

test("deduplicates repeated names case-insensitively", () => {
  assert.equal(parseBreweries("Adnams;adnams;ADNAMS").names, "Adnams");
});

test("caps how many names are kept", () => {
  const many = Array.from({ length: 20 }, (_, i) => `Brewery ${i}`).join(";");
  assert.equal(parseBreweries(many).names.split("; ").length, MAX_BREWERY_NAMES);
});

test("caps overall length so one absurd tag can't bloat the dataset", () => {
  const long = Array.from({ length: 8 }, (_, i) => `${"x".repeat(80)}${i}`).join(";");
  assert.ok(parseBreweries(long).names.length <= 200);
});
