import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeRows, haversineMiles } from "./dedupe.mjs";

// Row shape: [name, lat, lon, address, ...19 more fields]
const row = (name, lat, lon, ...rest) => [name, lat, lon, ...rest, ...Array(20 - rest.length).fill("")];

test("leaves distinct pubs untouched", () => {
  const rows = [row("The Red Lion", 51.5, -0.1, "1 High St"), row("The Crown", 52.0, -1.0, "2 Main St")];
  const result = dedupeRows(rows);
  assert.equal(result.length, 2);
});

test("collapses same-name pubs a few metres apart", () => {
  const rows = [row("Victoria Inn", 50.26337, -5.11344, "Chyvelah Road, TR3 6BY"), row("Victoria Inn", 50.26338, -5.11345, "Chyvelah Road, TR3 6BY")];
  const result = dedupeRows(rows);
  assert.equal(result.length, 1);
});

test("keeps the more complete duplicate", () => {
  const sparse = row("The Anchor", 51.5, -0.1, ""); // no address
  const complete = row("The Anchor", 51.50001, -0.10001, "1 Quay St", "The Brewery", "https://example.com");
  const result = dedupeRows([sparse, complete]);
  assert.equal(result.length, 1);
  assert.equal(result[0][3], "1 Quay St");
});

test("does not collapse same-name pubs in different towns", () => {
  // Two real, distinct "The Red Lion" pubs several miles apart.
  const rows = [row("The Red Lion", 51.5, -0.1, "London"), row("The Red Lion", 51.6, -0.3, "Also London, but not the same pub")];
  const result = dedupeRows(rows);
  assert.equal(result.length, 2);
});

test("does not collapse different-name pubs at the same address", () => {
  const rows = [row("The Ship", 51.5, -0.1, "1 Quay St"), row("The Anchor", 51.5, -0.1, "1 Quay St")];
  const result = dedupeRows(rows);
  assert.equal(result.length, 2);
});

test("is idempotent -- deduping already-clean data changes nothing", () => {
  const rows = [row("The Red Lion", 51.5, -0.1), row("The Crown", 52.0, -1.0), row("The Ship", 53.0, 0.0)];
  const once = dedupeRows(rows);
  const twice = dedupeRows(once);
  assert.equal(twice.length, once.length);
});

test("haversineMiles is zero for identical points and positive otherwise", () => {
  assert.equal(haversineMiles(51.5, -0.1, 51.5, -0.1), 0);
  assert.ok(haversineMiles(51.5, -0.1, 52.5, -0.1) > 0);
});
