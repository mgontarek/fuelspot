import { parseGPX } from './gpx-parser';
import type { ParsedRoute } from './gpx-parser';
import { initRouteMap } from './route-map';
import { initGpsTracker } from './gps-tracker';
import type { GeolocationProvider, GpsTrackerHandle, GpsState } from './gps-tracker';
import { createOverpassClient, createCachedFetcher } from './poi-fetcher';
import type { OverpassClient } from './poi-fetcher';
import { initResultCard } from './result-card';
import { rankStops } from './stop-ranker';
import { evaluateHours, createOpeningHoursParser } from './hours-evaluator';
import { matchPosition } from './route-matcher';
import { haversine } from './geo';

const STORAGE_KEY = 'fuelspot-gpx';

export function initUpload(geo?: GeolocationProvider, overpassClient?: OverpassClient): void {
  const fileInput = document.getElementById('gpx-input') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
  const loadingIndicator = document.getElementById('loading-indicator') as HTMLElement;
  const statsSection = document.getElementById('route-stats') as HTMLElement;
  const errorSection = document.getElementById('error-display') as HTMLElement;
  const routeName = document.getElementById('route-name') as HTMLElement;
  const pointCount = document.getElementById('point-count') as HTMLElement;
  const routeDistance = document.getElementById('route-distance') as HTMLElement;
  const mapContainer = document.getElementById('map-container') as HTMLElement;
  const resultCardContainer = document.getElementById('result-card-container') as HTMLElement;

  const mapHandle = initRouteMap(mapContainer);
  const resultCard = initResultCard(resultCardContainer);
  const client = overpassClient ?? createOverpassClient();
  const cachedFetcher = createCachedFetcher(client);
  const hoursParser = createOpeningHoursParser();

  let gpsTracker: GpsTrackerHandle | null = null;
  let currentRoute: ParsedRoute | null = null;
  let hasAutoSearched = false;
  let pipelineInFlight = false;

  const geoProvider = geo ?? (typeof navigator !== 'undefined' && navigator.geolocation
    ? navigator.geolocation
    : null);

  function onGpsChange(state: GpsState): void {
    if (state.position) {
      mapHandle.showRiderPosition(state.position);
    }
    if (state.match) {
      if (state.match.isOnRoute) {
        mapHandle.hideOffRouteWarning();
      } else {
        mapHandle.showOffRouteWarning();
      }
    }

    if (state.error === 'denied' && currentRoute) {
      resultCard.showError('GPS access denied — enable location to find stops');
      return;
    }

    if (state.position && currentRoute && !hasAutoSearched) {
      hasAutoSearched = true;
      searchAndDisplay();
    }
  }

  if (geoProvider) {
    gpsTracker = initGpsTracker(geoProvider, onGpsChange);
  }

  async function searchAndDisplay(): Promise<void> {
    if (!currentRoute || pipelineInFlight) return;

    const gpsState = gpsTracker?.getState();
    if (!gpsState?.position) {
      resultCard.showError('GPS position not available — enable location to find stops');
      return;
    }

    pipelineInFlight = true;
    refreshBtn.disabled = true;
    resultCard.showLoading();
    loadingIndicator.hidden = false;
    errorSection.hidden = true;

    try {
      const pois = await cachedFetcher.fetch(currentRoute.points);

      const gpsStateNow = gpsTracker!.getState();
      const position = gpsStateNow.position ?? gpsState.position;
      const match = gpsStateNow.match ?? matchPosition(currentRoute.points, position);

      const ranked = rankStops(
        {
          pois,
          route: currentRoute.points,
          riderMatch: match,
          riderPosition: position,
          at: new Date(),
        },
        {
          evaluateHours: (oh, at) => evaluateHours(oh, at, hoursParser),
          matchPosition,
          haversine,
        },
      );

      mapHandle.showPOIs(pois);

      if (ranked.length === 0) {
        resultCard.showEmpty();
        mapHandle.clearHighlight();
      } else {
        const top = ranked[0];
        resultCard.showStop(top);
        mapHandle.highlightStop(top.poi);
        mapHandle.zoomToFit([position, { lat: top.poi.lat, lng: top.poi.lng }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stops';
      resultCard.showError(message);
    } finally {
      loadingIndicator.hidden = true;
      refreshBtn.disabled = false;
      pipelineInFlight = false;
    }
  }

  function showRoute(route: ParsedRoute): void {
    currentRoute = route;
    hasAutoSearched = false;
    routeName.textContent = route.name ?? 'Unnamed route';
    pointCount.textContent = `${route.points.length} points`;
    routeDistance.textContent = `${(route.totalDistance / 1000).toFixed(1)} km`;
    statsSection.hidden = false;
    errorSection.hidden = true;
    clearBtn.hidden = false;
    refreshBtn.hidden = false;
    mapHandle.showRoute(route);
    gpsTracker?.start(route.points);

    if (geoProvider) {
      resultCard.showWaitingForGps();
    }
  }

  function showError(message: string): void {
    errorSection.textContent = message;
    errorSection.hidden = false;
    statsSection.hidden = true;
  }

  function resetUI(): void {
    currentRoute = null;
    hasAutoSearched = false;
    statsSection.hidden = true;
    errorSection.hidden = true;
    clearBtn.hidden = true;
    refreshBtn.hidden = true;
    fileInput.value = '';
    mapHandle.clear();
    mapHandle.clearPOIs();
    mapHandle.clearHighlight();
    resultCard.clear();
    gpsTracker?.stop();
    mapHandle.clearRiderPosition();
    mapHandle.hideOffRouteWarning();
    cachedFetcher.clear();
  }

  // Load from localStorage on init
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      showRoute(parseGPX(stored));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const gpxString = reader.result as string;
      try {
        const route = parseGPX(gpxString);
        localStorage.setItem(STORAGE_KEY, gpxString);
        showRoute(route);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to parse GPX');
      }
    };
    reader.readAsText(file);
  });

  clearBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    resetUI();
  });

  refreshBtn.addEventListener('click', () => {
    if (!currentRoute || refreshBtn.disabled) return;

    const gpsState = gpsTracker?.getState();
    if (!gpsState?.position) {
      resultCard.showError('GPS position not available — enable location to find stops');
      return;
    }

    searchAndDisplay();
  });
}
