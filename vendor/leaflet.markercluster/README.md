Vendored copy of [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
v1.5.3 (MIT licensed, see `LICENSE.txt`), pulled from the npm-published dist build.

Self-hosted rather than loaded from a CDN: the sandbox this project was built in
blocks unpkg.com by policy, and self-hosting also means the service worker's
same-origin caching actually covers it for offline use, unlike a cross-origin
CDN request would.

To upgrade: `npm pack leaflet.markercluster@<version>` and copy
`dist/leaflet.markercluster.js`, `dist/MarkerCluster.css`, and
`dist/MarkerCluster.Default.css` over these files.
