// Parsing for OSM's brewery=* tag, which on a pub lists the brand(s) of
// beer served, semicolon-separated (e.g. "Timothy Taylor;Adnams").
//
// In practice the values are messy: alongside real brewery names the tag
// carries bare "yes"/"no" (which say nothing about *which* beers are on)
// and words like "various"/"guest"/"rotating" that mean a changing
// selection rather than a named brand. Those are pulled apart here so the
// app can say "guest beers" honestly instead of rendering "yes" as if it
// were the name of a brewery -- the same rule the rest of this project
// follows for wheelchair/payment tags: only claim what the data states.

const ROTATING_VALUES = new Set([
  "various",
  "varies",
  "variable",
  "guest",
  "guests",
  "guest beer",
  "guest beers",
  "guest ales",
  "rotating",
  "changing",
  "multiple",
  "many",
  "several",
  "assorted",
]);

const NON_NAMES = new Set(["yes", "no", "unknown", "none", "n/a", ...ROTATING_VALUES]);

export const MAX_BREWERY_NAMES = 8;
export const MAX_BREWERIES_LENGTH = 200;

/**
 * @param {string|undefined} value Raw brewery=* tag value.
 * @returns {{names: string, rotating: boolean}} `names` is a "; "-joined
 *   list of nameable breweries (empty if none); `rotating` is true when the
 *   tag indicated a guest/changing selection.
 */
export function parseBreweries(value) {
  const names = [];
  const seen = new Set();
  let rotating = false;

  for (const token of (value || "").split(";")) {
    const name = token.trim();
    if (!name) continue;

    const lower = name.toLowerCase();
    if (ROTATING_VALUES.has(lower)) {
      rotating = true;
      continue;
    }
    // "yes"/"no"/etc. confirm nothing nameable, so they're dropped rather
    // than shown -- a "yes" alongside real names is just harmless noise.
    if (NON_NAMES.has(lower)) continue;
    if (seen.has(lower)) continue;

    seen.add(lower);
    if (names.length < MAX_BREWERY_NAMES) names.push(name);
  }

  return { names: names.join("; ").slice(0, MAX_BREWERIES_LENGTH), rotating };
}
