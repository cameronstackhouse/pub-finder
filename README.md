# pub-finder

A tiny static web app that lists every pub within a chosen radius of a UK postcode
(and can surprise you with a random one).

- Enter a postcode and pick a radius (0.5–15 miles).
- The app geocodes the postcode with [postcodes.io](https://postcodes.io) (free, no API key).
- Pub locations come from `data/pubs-gb.json`, a static dataset of every OpenStreetMap
  `amenity=pub` in Great Britain, filtered and sorted entirely in the browser — no live
  Overpass API call at search time, so it's fast and works the same in rural areas as
  in cities. If nothing falls within the chosen radius, the closest few pubs are shown
  instead.

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
