# pub-finder

A tiny static web app that finds a random pub within a chosen radius of a UK postcode.

- Enter a postcode and pick a radius (0.5–15 miles).
- The app geocodes the postcode with [postcodes.io](https://postcodes.io) (free, no API key).
- It queries [OpenStreetMap](https://www.openstreetmap.org/copyright) pubs via the free Overpass API.
- A random matching pub is shown on a map, with an option to reroll or get directions.

No backend, no API keys, no billing — everything runs client-side against free public APIs.

## Local dev

Just open `index.html` in a browser, or serve the folder with any static file server:

```sh
python3 -m http.server 8000
```

## Deployment

Deployed automatically to GitHub Pages via `.github/workflows/deploy.yml` on every push.
