# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm test             # Run Vitest in watch mode
npm run test:run     # Run tests once (used in CI)
npm run build        # TypeScript check + Vite build
npm run preview      # Preview production build locally
```

Run a single test file:
```bash
npx vitest run src/gpx-parser.test.ts
```

## Architecture

FuelSpot is a static single-page app (no backend) for ultra-cyclists to find open resupply stops along a GPX route. Built with vanilla TypeScript + Vite, deployed to GitHub Pages.

**Current modules:**

- **`gpx-parser.ts`** — Pure function `parseGPX(gpxString) → ParsedRoute`. Handles namespace-aware XML parsing, trackpoint/routepoint extraction, haversine distance computation.
- **`geo.ts`** — `haversine(a, b)` distance function shared across modules.
- **`upload.ts`** — DOM layer. `initUpload()` wires up file input, persists GPX to localStorage (`fuelspot-gpx`), displays route stats. Contains `searchAndDisplay()` pipeline that fetches POIs, ranks stops, and displays the #1 result. Auto-searches on first GPS fix after route load.
- **`result-card.ts`** — `initResultCard(container) → ResultCardHandle` renders the top-ranked stop with status badge, distance, hours, and card payment info. Handles loading, error, empty, and waiting-for-GPS states.
- **`route-map.ts`** — Leaflet map display with route visualization, POI pins, rider position, and highlighted #1 stop.
- **`gps-tracker.ts`** — GPS position tracking.
- **`route-matcher.ts`** — `matchPosition(route, position)` projects a lat/lng onto the route, returning cumulative distance and on/off-route status.
- **`poi-fetcher.ts`** — Overpass API client with retry, cache, and POI parsing. Exports `POI` type.
- **`hours-evaluator.ts`** — `evaluateHours(openingHours, at, parser)` evaluates OSM opening_hours strings via dependency-injected parser. `createOpeningHoursParser()` wraps the `opening_hours` library. `formatCountdown(from, to)` for human-readable time deltas.
- **`stop-ranker.ts`** — `rankStops(params, deps)` ranks POIs by open/closed/unknown status and distance. On-route mode filters forward-only and sorts by route distance; off-route mode sorts by straight-line distance.
- **`main.ts`** — Entry point.

## Key Decisions

- **Minimal runtime dependencies** — only `opening_hours` (~150KB) for OSM hours parsing. All other build/test tooling is devDependencies only.
- **Mobile-first** — designed for one-handed use, 480px max-width.
- **TDD** — tests use real-world GPX fixtures in `src/test-fixtures/gpx-samples.ts`. Test external behavior through public interface, not implementation details.
- **Vite base path** is `/fuelspot/` for GitHub Pages subdirectory hosting.
- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters` enabled — the build will fail on unused variables.

## CI/CD

- PRs to `main` → runs tests (`ci.yml`)
- Push to `main` → runs tests, builds, deploys to GitHub Pages (`deploy.yml`)
