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
import type { I18n } from './i18n';

const STORAGE_KEY = 'fuelspot-gpx';

export function applyStaticTranslations(i18n: I18n): void {
  const elements = document.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = i18n.t(key);
    }
  }
}

export function initUpload(geo?: GeolocationProvider, overpassClient?: OverpassClient, i18n?: I18n): void {
  const fileInput = document.getElementById('gpx-input') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
  const loadingIndicator = document.getElementById('loading-indicator') as HTMLElement;
  const statsSection = document.getElementById('route-stats') as HTMLElement;
  const warningSection = document.getElementById('warning-display') as HTMLElement;
  const errorSection = document.getElementById('error-display') as HTMLElement;
  const routeName = document.getElementById('route-name') as HTMLElement;
  const pointCount = document.getElementById('point-count') as HTMLElement;
  const routeDistance = document.getElementById('route-distance') as HTMLElement;
  const mapContainer = document.getElementById('map-container') as HTMLElement;
  const resultCardContainer = document.getElementById('result-card-container') as HTMLElement;

  function tt(key: string, params?: Record<string, string | number>): string {
    return i18n ? i18n.t(key, params) : fallbackUpload(key, params);
  }

  if (i18n) {
    applyStaticTranslations(i18n);
  }

  const mapHandle = initRouteMap(mapContainer, undefined, i18n);
  const resultCard = initResultCard(resultCardContainer, i18n);
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
      resultCard.showError(tt('gps.denied'));
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
      resultCard.showError(tt('gps.unavailable'));
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
          evaluateHours: (oh, at) => evaluateHours(oh, at, hoursParser, i18n),
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
      const message = err instanceof Error ? err.message : tt('route.loadFailed');
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
    routeName.textContent = route.name ?? tt('route.unnamed');
    pointCount.textContent = tt('route.points', { count: route.points.length });
    routeDistance.textContent = tt('route.distance', { distance: (route.totalDistance / 1000).toFixed(1) });
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

  function showWarning(message: string): void {
    warningSection.textContent = message;
    warningSection.hidden = false;
  }

  function trySaveRoute(gpxString: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, gpxString);
    } catch {
      showWarning(tt('storage.quotaWarning'));
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
    warningSection.hidden = true;
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

  // Subscribe to locale changes to re-render static text
  if (i18n) {
    i18n.onChange(() => {
      applyStaticTranslations(i18n);
      // Re-render route stats if a route is loaded
      if (currentRoute) {
        routeName.textContent = currentRoute.name ?? tt('route.unnamed');
        pointCount.textContent = tt('route.points', { count: currentRoute.points.length });
        routeDistance.textContent = tt('route.distance', { distance: (currentRoute.totalDistance / 1000).toFixed(1) });
      }
    });
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
      warningSection.hidden = true;
      try {
        const route = parseGPX(gpxString);
        trySaveRoute(gpxString);
        showRoute(route);
      } catch (err) {
        showError(err instanceof Error ? err.message : tt('route.parseFailed'));
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
      resultCard.showError(tt('gps.unavailable'));
      return;
    }

    searchAndDisplay();
  });
}

function fallbackUpload(key: string, params?: Record<string, string | number>): string {
  const map: Record<string, string> = {
    'gps.denied': 'GPS access denied — enable location to find stops',
    'gps.unavailable': 'GPS position not available — enable location to find stops',
    'route.unnamed': 'Unnamed route',
    'route.points': '{count} points',
    'route.distance': '{distance} km',
    'route.parseFailed': 'Failed to parse GPX',
    'route.loadFailed': 'Failed to load stops',
    'storage.quotaWarning': 'Route is too large to save for offline use — it will not persist across reloads',
  };
  let value = map[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}
