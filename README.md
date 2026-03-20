# FuelSpot

A web app for ultra-cyclists to find the nearest **open** resupply stop along their planned route.

**[Try it live](https://mgontarek.github.io/fuelspot/)**

## Features

- **GPX route upload** — load any GPX file to define your route
- **POI search** — queries the Overpass API for shops, gas stations, and other resupply points near your route
- **Opening hours evaluation** — checks if stops are open now, with countdown to next opening
- **Smart stop ranking** — prioritizes open stops, then soonest-to-open, then unknown hours
- **GPS tracking** — tracks your position and auto-searches for the best stop ahead
- **On/off-route detection** — shows distance from route when you deviate, switches to straight-line ranking
- **Interactive map** — Leaflet map with route visualization, POI pins, rider position, and highlighted top stop
- **Bilingual UI** — English and Polish, switchable at any time
- **PWA installable** — add to home screen for offline-capable access
- **localStorage persistence** — your route survives page reloads (with graceful quota handling)
- **Mobile-first design** — optimized for one-handed use on the bike

## Tech Stack

- **TypeScript** (strict mode) + **Vite**
- **Vitest** for testing
- **Leaflet** for maps
- **Overpass API** for OpenStreetMap POI data
- **opening_hours** library for OSM hours parsing
- No backend — fully static SPA deployed to GitHub Pages

## Getting Started

```bash
npm install        # install dependencies
npm run dev        # start dev server
npm test           # run tests in watch mode
npm run test:run   # run tests once (CI)
npm run build      # type-check + production build
npm run preview    # preview production build locally
```

## Architecture

FuelSpot is a pipeline that transforms a GPX file into a ranked resupply recommendation:

```
GPX file → parse route → match rider position → fetch nearby POIs
         → evaluate opening hours → rank stops → display result + map
```

Key modules:

| Module | Responsibility |
|---|---|
| `gpx-parser` | Parse GPX into trackpoints with cumulative distances |
| `route-matcher` | Project GPS position onto route, detect on/off-route |
| `poi-fetcher` | Query Overpass API, cache results, parse POI data |
| `hours-evaluator` | Evaluate OSM `opening_hours` strings, format countdowns |
| `stop-ranker` | Rank POIs by status and distance (route or straight-line) |
| `result-card` | Render the top-ranked stop with status, distance, and hours |
| `route-map` | Leaflet map with route, POIs, rider, and highlighted stop |
| `gps-tracker` | GPS position tracking |
| `i18n` | EN/PL internationalization with reactive locale switching |

## Deployment

- **PRs to `main`** — CI runs tests
- **Push to `main`** — CI runs tests, builds, and deploys to GitHub Pages
