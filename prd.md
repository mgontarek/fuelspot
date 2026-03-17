## Problem Statement

Ultra-cyclists on long-distance rides (200km+) need to resupply with water, food, and other essentials. They plan routes in advance using GPX files loaded onto cycling computers, but have no easy way to know where the next **open** store or gas station is **along their specific route**. Existing map apps (Google Maps, OSM) show nearby POIs but don't understand the rider's planned route — they suggest detours or show places behind the rider. When a cyclist is exhausted, dehydrated, and operating one-handed on a phone, they need a single glanceable answer: "the next open stop is X km ahead."

## Solution

FuelSpot is a lightweight, mobile-friendly web app (PWA-capable, add-to-homescreen on iPhone) that:

1. Accepts a GPX file upload (persisted in localStorage until cleared).
2. Uses device GPS to determine the rider's current position on the route.
3. Queries the Overpass API to find resupply stops within a 300m corridor of the route.
4. Shows the **nearest open stop ahead** on the route — with distance, type, hours, and card payment info.
5. Displays a Leaflet/OSM map with the route segment, rider position, and the stop.
6. If the rider is >500m off-route, warns them and shows the nearest stop in any direction.
7. If no stop is currently open, shows the next one that will open soonest with a countdown.

The UI is minimal and designed for one-handed, mid-ride use. A manual refresh button re-queries as the rider progresses.

## User Stories

1. As an ultra-cyclist, I want to upload my GPX route file once, so that I don't have to re-upload it every time I open the app during a ride.
2. As an ultra-cyclist, I want the app to automatically find the nearest open stop when I open it, so that I get an answer immediately without extra taps.
3. As an ultra-cyclist, I want to see only stops that are **ahead** on my route, so that I don't waste energy going backwards.
4. As an ultra-cyclist, I want to see the distance in kilometers to the next stop along my route, so that I can pace myself.
5. As an ultra-cyclist, I want to know the type of stop (gas station, supermarket, bakery, cafe, restaurant, convenience store), so that I can set expectations about what's available.
6. As an ultra-cyclist, I want to see the opening hours of the stop, so that I know if it will still be open when I arrive.
7. As an ultra-cyclist, I want to know if a stop accepts card payments, so that I don't ride there only to find out I need cash.
8. As an ultra-cyclist, I want stops with unknown opening hours to still appear (but ranked lower), so that I don't miss a potentially open stop.
9. As an ultra-cyclist, I want to see the next stop that will open soonest (with a countdown) if nothing is currently open, so that I can plan my pace around its opening time.
10. As an ultra-cyclist, I want to be warned when I'm off my planned route, so that I know the app's suggestions have switched to nearest-in-any-direction mode.
11. As an ultra-cyclist, I want the off-route mode to show me the nearest stop regardless of direction, so that I can resupply even when lost.
12. As an ultra-cyclist, I want the app to resume normal forward-only mode when I return to my route, so that I get route-aware results again.
13. As an ultra-cyclist, I want a manual refresh button to re-query my position and find updated stops, so that results stay current as I progress.
14. As an ultra-cyclist, I want to see a map showing my route, my current position, and the stop location, so that I have spatial context.
15. As an ultra-cyclist, I want the UI to be simple and operable with one hand, so that I can use it while riding or stopped at the roadside.
16. As an ultra-cyclist, I want to add the app to my iPhone homescreen as a PWA, so that it feels like a native app.
17. As an ultra-cyclist, I want to switch the app language between English and Polish, so that I can use it in my preferred language.
18. As an ultra-cyclist, I want distances shown in kilometers, so that they match my cycling computer.
19. As an ultra-cyclist, I want to clear my loaded route and upload a new one, so that I can use the app for different rides.
20. As an ultra-cyclist, I want the app to handle GPX files from common tools (Komoot, RideWithGPS, Strava, Garmin Connect), so that I don't need to convert files.
21. As an ultra-cyclist, I want the app to correctly handle routes that loop or overlap (out-and-back), always progressing forward from start to finish.
22. As an ultra-cyclist, I want to see a clean result card at the top of the screen with the key info (name, type, distance, hours, payment), so that I can glance at it quickly.

## Implementation Decisions

### Architecture
- **Static single-page app** — no backend server. All logic runs client-side.
- **Deployment** on GitHub Pages.
- **No authentication** — single-user tool, no accounts.
- **localStorage** for GPX file persistence.

### Modules

1. **GPX Parser** — parses GPX XML into an ordered array of route points (lat, lng) with cumulative distance from start. Pure function, no dependencies on DOM or network.

2. **Route Matcher** — takes route points + current GPS position, returns: whether the rider is on-route, the nearest point index on the track, distance from route, and distance traveled along the route. Off-route threshold: 500m. Pure function.

3. **POI Fetcher (Overpass Client)** — builds an Overpass API query for the route corridor (300m each side). Fetches gas stations, convenience stores, supermarkets, bakeries, restaurants, and cafes. Returns POIs with name, type, coordinates, opening_hours, and payment tags.

4. **Hours Evaluator** — parses OSM opening_hours strings (using a library like opening_hours.js) and evaluates open/closed status at a given time. Returns current status, next opening time, and display string. Pure function.

5. **Stop Ranker** — takes POIs with evaluated hours + rider's route position. In on-route mode: filters to forward-only stops, ranks open first (by distance), then soonest-to-open (with countdown), then unknown-hours (by distance). In off-route mode: ranks by straight-line distance in any direction.

6. **UI Layer** — thin shell wiring modules together. GPX upload/clear, refresh button, result card, Leaflet map, EN/PL language toggle, off-route warning banner.

### Key Parameters
- Search corridor: 300m each side of GPX track
- Off-route threshold: 500m from GPX track
- POI categories: gas station, convenience store, supermarket, bakery, restaurant, cafe
- Units: kilometers
- Languages: English, Polish
- Map: Leaflet + OpenStreetMap tiles
- Data: Overpass API (OpenStreetMap)

### Tech Stack
- Lightweight frontend (Vite + vanilla TypeScript or Vite + Preact — to be decided at implementation time, optimizing for simplicity and testability)
- No backend, no database, no auth
- GPS via browser Geolocation API (single fix per refresh, no continuous tracking)

## Testing Decisions

### What makes a good test
Tests should verify **external behavior through the module's public interface**, not implementation details. Given an input, assert the output. Do not test internal helper functions directly — if they matter, they're reachable through the public API.

### Modules to test

1. **GPX Parser** — test with real-world GPX snippets (Komoot, Strava, Garmin exports). Verify point extraction, distance calculation, handling of malformed files.

2. **Route Matcher** — test on-route detection, off-route detection at boundary (499m vs 501m), forward progression, handling of loops/overlaps, GPS drift tolerance.

3. **Hours Evaluator** — test common OSM opening_hours formats (simple, complex, 24/7, seasonal), missing data, edge cases around midnight, "opens soonest" calculation.

4. **Stop Ranker** — test ranking logic: open before closed, soonest-to-open before unknown, forward-only filtering, off-route mode switching to nearest-in-any-direction.

5. **POI Fetcher** — test with mocked HTTP responses. Verify correct Overpass query construction and response parsing.

6. **UI Layer** — lowest test priority. E2E tests may be added later but are not required for MVP.

### Test runner
Use Vitest (pairs naturally with Vite) for unit tests. Tests should run in Node (not browser) for speed, except any that require DOM APIs.

## Out of Scope

- TCX file support (GPX only for MVP)
- Offline / cached mode
- Multiple simultaneous routes
- Continuous GPS tracking / background location
- Native mobile app (iOS/Android)
- User accounts / authentication / sharing
- Water fountains, vending machines as stop types
- Auto-refresh or movement-based refresh
- Mile/imperial unit support
- Backend server or database

## Further Notes

- **OSM data quality**: Opening hours coverage in OSM varies by region. The app mitigates this by showing unknown-hours stops (ranked lower) rather than hiding them. A future enhancement could selectively query Google Places API for hours on top candidates.
- **opening_hours parsing**: The OSM opening_hours format is complex (supports holidays, seasons, exceptions). Using the established opening_hours.js library is strongly recommended over writing a custom parser.
- **Battery impact**: Minimal — GPS is only requested on manual refresh tap, not continuously. No background processes.
- **Future enhancements** (post-MVP): TCX support, offline pre-caching of stops on GPX upload, auto-refresh based on movement, multiple route support, richer POI data via Google Places API, native app wrapper.
