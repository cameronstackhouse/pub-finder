# pub-finder

> **Disclaimer:** this project is entirely AI-generated (built with Claude Code).
> The maintainer has not read any of the code.

A tiny static web app that lists every pub within a chosen radius of a UK postcode
(and can surprise you with a random one).

- Enter a postcode and pick a radius (0.5–15 miles).
- The app geocodes the postcode with [postcodes.io](https://postcodes.io) (free, no API key).
- Pub locations come from `data/pubs-gb.json`, a static dataset of every OpenStreetMap
  `amenity=pub` in Great Britain, filtered and sorted entirely in the browser — no live
  Overpass API call at search time, so it's fast and works the same in rural areas as
  in cities. If nothing falls within the chosen radius, the closest few pubs are shown
  instead.
- The Map tab browses the whole dataset directly: every pub renders as a clustered
  marker (via [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster),
  vendored in `vendor/` rather than loaded from a CDN — see that folder's README) that
  resolves into individual pins as you zoom in, so you can explore visually instead of
  only searching by postcode.

No backend, no API keys, no billing.

## Local dev

Just open `index.html` in a browser, or serve the folder with any static file server:

```sh
python3 -m http.server 8000
```

## Refreshing the pub dataset

`data/pubs-gb.json` is built by `scripts/build-pubs-data.mjs` from a Geofabrik OSM
extract of Great Britain, filtered with `osmium-tool`. Run the "Update GB pubs dataset"
GitHub Actions workflow (`.github/workflows/update-pub-data.yml`, manually triggered) to
regenerate it and commit the result.

The same physical pub sometimes appears twice in OSM (a node and a way both
tagged `amenity=pub` for the same building, a few metres apart). The build
script collapses these (`scripts/lib/dedupe.mjs`) before writing the file, so
`data/pubs-gb.json` ships already deduplicated -- the app doesn't need to
(and doesn't) dedupe on every search/crawl/map load.

### Tap selection

What's on tap comes from OSM's `brewery=*` tag (the beer brands a pub serves),
plus `microbrewery=*` and `real_cider=*`. No extra data source or API is
involved -- these tags are already in the same extract the pipeline downloads.

`brewery=*` values are messy in practice, so `scripts/lib/breweries.mjs`
separates real brewery names from bare `yes`/`no` (which say nothing about
*which* beers are on) and from `various`/`guest`/`rotating` (a changing
selection rather than a brand). A pub tagged `brewery=yes` therefore shows no
tap information at all rather than "On tap: yes". Coverage is partial and the
build logs exactly how partial on every run, so nothing is assumed.

## Deployment

Deployed automatically to GitHub Pages via `.github/workflows/deploy.yml` on every push.

## Type-checking

`app.js` is still plain JavaScript -- no build step, no bundler, deployment is
still "copy the static files as-is". Types come from JSDoc comments, checked
by TypeScript in `--checkJs` mode (see `tsconfig.json`) purely as a lint step:

```sh
npm install
npm run typecheck
```

Runs automatically on push via `.github/workflows/typecheck.yml`. Scoped to
`app.js` only for now (it's the file with the complex, shared `Pub` data
shape); `scripts/build-pubs-data.mjs` runs in Node rather than the browser
and hasn't been brought in yet.

## Unit tests and data integrity

`scripts/lib/dedupe.mjs` (the OSM duplicate-collapsing logic) has plain
Node unit tests, and a small script confirms the shipped dataset is still
fully deduplicated -- both run in CI alongside typecheck on every push:

```sh
npm run test:unit
npm run check-data
```

## End-to-end tests

Playwright specs under `tests/` drive the built app in a real browser --
search, favourites, banning, the crawl planner, tab switching -- with
postcodes.io and the pub dataset mocked so runs are fast and deterministic:

```sh
npm install
npx playwright install --with-deps chromium
npm run test:e2e
```

Runs automatically on push via `.github/workflows/e2e-tests.yml`.
