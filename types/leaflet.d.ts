// Leaflet is loaded from a CDN <script> tag, not an npm dependency, so there's
// no real @types/leaflet install here to stay in sync with -- L is typed as
// `any` rather than modelling its API, which would drift from whatever
// version the CDN <script> tag in index.html actually pins.
declare const L: any;
