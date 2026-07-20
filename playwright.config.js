import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Some sandboxes pre-install a single Chromium build outside Playwright's
// own managed cache (no internet access to fetch one on demand). Use it
// when present; a normal environment with `playwright install`-managed
// browsers is untouched since this path won't exist there.
const localChromium = "/opt/pw-browsers/chromium";
const launchOptions = fs.existsSync(localChromium) ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    // The app registers a service worker; blocking it in tests avoids
    // cross-test caching interference (a stale cached index.html/app.js
    // would make failures nondeterministic and hard to reproduce).
    serviceWorkers: "block",
  },
  webServer: {
    command: "python3 -m http.server 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } }],
});
