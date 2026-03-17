import { parseGPX } from './gpx-parser';
import type { ParsedRoute } from './gpx-parser';
import { initRouteMap } from './route-map';
import { initGpsTracker } from './gps-tracker';
import type { GeolocationProvider, GpsTrackerHandle } from './gps-tracker';
import { fetchPOIs, createOverpassClient } from './poi-fetcher';
import type { OverpassClient } from './poi-fetcher';

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

  const mapHandle = initRouteMap(mapContainer);
  const client = overpassClient ?? createOverpassClient();

  let gpsTracker: GpsTrackerHandle | null = null;
  let currentRoute: ParsedRoute | null = null;

  const geoProvider = geo ?? (typeof navigator !== 'undefined' && navigator.geolocation
    ? navigator.geolocation
    : null);

  if (geoProvider) {
    gpsTracker = initGpsTracker(geoProvider, (state) => {
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
    });
  }

  function showRoute(route: ParsedRoute): void {
    currentRoute = route;
    routeName.textContent = route.name ?? 'Unnamed route';
    pointCount.textContent = `${route.points.length} points`;
    routeDistance.textContent = `${(route.totalDistance / 1000).toFixed(1)} km`;
    statsSection.hidden = false;
    errorSection.hidden = true;
    clearBtn.hidden = false;
    refreshBtn.hidden = false;
    mapHandle.showRoute(route);
    gpsTracker?.start(route.points);
  }

  function showError(message: string): void {
    errorSection.textContent = message;
    errorSection.hidden = false;
    statsSection.hidden = true;
  }

  function resetUI(): void {
    currentRoute = null;
    statsSection.hidden = true;
    errorSection.hidden = true;
    clearBtn.hidden = true;
    refreshBtn.hidden = true;
    fileInput.value = '';
    mapHandle.clear();
    mapHandle.clearPOIs();
    gpsTracker?.stop();
    mapHandle.clearRiderPosition();
    mapHandle.hideOffRouteWarning();
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
    if (!currentRoute) return;
    loadingIndicator.hidden = false;
    errorSection.hidden = true;

    fetchPOIs(currentRoute.points, client)
      .then((pois) => {
        mapHandle.showPOIs(pois);
      })
      .catch((err) => {
        showError(err instanceof Error ? err.message : 'Failed to load stops');
      })
      .finally(() => {
        loadingIndicator.hidden = true;
      });
  });
}
