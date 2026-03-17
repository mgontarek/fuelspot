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

- **`gpx-parser.ts`** — Pure function `parseGPX(gpxString) → ParsedRoute`. Handles namespace-aware XML parsing, trackpoint/routepoint extraction, haversine distance computation. Tested against real GPX exports from Komoot, Strava, and Garmin.
- **`upload.ts`** — DOM layer. `initUpload()` wires up file input, persists GPX to localStorage (`fuelspot-gpx`), displays route stats.
- **`main.ts`** — Entry point, imports and calls `initUpload()`.

**Planned modules** (see `prd.md` for full spec): Route Matcher, POI Fetcher (Overpass API), Hours Evaluator (opening_hours), Stop Ranker.

## Key Decisions

- **Zero runtime dependencies** — intentional for minimal bundle size. All build/test tooling is devDependencies only.
- **Mobile-first** — designed for one-handed use, 480px max-width.
- **TDD** — tests use real-world GPX fixtures in `src/test-fixtures/gpx-samples.ts`. Test external behavior through public interface, not implementation details.
- **Vite base path** is `/fuelspot/` for GitHub Pages subdirectory hosting.
- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters` enabled — the build will fail on unused variables.

## CI/CD

- PRs to `main` → runs tests (`ci.yml`)
- Push to `main` → runs tests, builds, deploys to GitHub Pages (`deploy.yml`)
