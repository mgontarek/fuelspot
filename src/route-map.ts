import type { ParsedRoute } from './gpx-parser';
import type { POI, POIType } from './poi-fetcher';
import type * as L from 'leaflet';

export interface RouteMapHandle {
  showRoute(route: ParsedRoute): void;
  clear(): void;
  destroy(): void;
  showRiderPosition(position: { lat: number; lng: number }): void;
  clearRiderPosition(): void;
  showOffRouteWarning(): void;
  hideOffRouteWarning(): void;
  showPOIs(pois: POI[]): void;
  clearPOIs(): void;
  highlightStop(poi: POI): void;
  clearHighlight(): void;
  zoomToFit(positions: Array<{ lat: number; lng: number }>): void;
}

export interface LeafletFactory {
  map(container: HTMLElement, options?: L.MapOptions): L.Map;
  tileLayer(urlTemplate: string, options?: L.TileLayerOptions): L.TileLayer;
  polyline(
    latlngs: L.LatLngExpression[],
    options?: L.PolylineOptions,
  ): L.Polyline;
  marker(latlng: L.LatLngExpression, options?: L.MarkerOptions): L.Marker;
  circleMarker(
    latlng: L.LatLngExpression,
    options?: L.CircleMarkerOptions,
  ): L.CircleMarker;
}

const POI_COLORS: Record<POIType, string> = {
  fuel: '#ef4444',
  convenience: '#22c55e',
  supermarket: '#22c55e',
  bakery: '#f59e0b',
  restaurant: '#8b5cf6',
  cafe: '#6366f1',
};

const DEFAULT_CENTER: L.LatLngExpression = [0, 0];
const DEFAULT_ZOOM = 2;
const PLACEHOLDER_TEXT = 'Upload a GPX file to see your route on the map';

export function initRouteMap(
  container: HTMLElement,
  factory?: LeafletFactory,
): RouteMapHandle {
  const placeholder = document.createElement('p');
  placeholder.className = 'map-placeholder';
  placeholder.textContent = PLACEHOLDER_TEXT;
  container.appendChild(placeholder);

  const mapDiv = document.createElement('div');
  mapDiv.className = 'map-inner';
  container.appendChild(mapDiv);

  const leaflet = factory ?? getDefaultFactory();
  const map = leaflet.map(mapDiv, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });

  leaflet
    .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    })
    .addTo(map);

  let currentPolyline: L.Polyline | null = null;
  let currentMarkers: L.Marker[] = [];
  let riderMarker: L.CircleMarker | null = null;

  const offRouteBanner = document.createElement('div');
  offRouteBanner.className = 'off-route-warning';
  offRouteBanner.textContent = 'You are off route';
  offRouteBanner.hidden = true;
  container.appendChild(offRouteBanner);

  function removeLayers(): void {
    if (currentPolyline) {
      currentPolyline.remove();
      currentPolyline = null;
    }
    for (const m of currentMarkers) {
      m.remove();
    }
    currentMarkers = [];
  }

  function showRoute(route: ParsedRoute): void {
    removeLayers();
    placeholder.hidden = true;
    mapDiv.hidden = false;

    requestAnimationFrame(() => {
      map.invalidateSize();
    });

    const latlngs: L.LatLngExpression[] = route.points.map(
      (p) => [p.lat, p.lng] as [number, number],
    );

    if (route.points.length > 1) {
      currentPolyline = leaflet
        .polyline(latlngs, { color: '#2563eb', weight: 4 })
        .addTo(map);
    }

    if (route.points.length >= 1) {
      const first = route.points[0];
      const startMarker = leaflet
        .marker([first.lat, first.lng], { title: 'Start' })
        .addTo(map);
      currentMarkers.push(startMarker);
    }

    if (route.points.length > 1) {
      const last = route.points[route.points.length - 1];
      const finishMarker = leaflet
        .marker([last.lat, last.lng], { title: 'Finish' })
        .addTo(map);
      currentMarkers.push(finishMarker);
    }

    if (route.points.length > 1 && currentPolyline) {
      map.fitBounds(currentPolyline.getBounds(), { padding: [20, 20] });
    } else if (route.points.length === 1) {
      map.setView([route.points[0].lat, route.points[0].lng], 14);
    }
  }

  function clear(): void {
    removeLayers();
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    placeholder.hidden = false;
    mapDiv.hidden = true;
  }

  function destroy(): void {
    map.remove();
  }

  function showRiderPosition(position: { lat: number; lng: number }): void {
    const latlng: L.LatLngExpression = [position.lat, position.lng];
    if (riderMarker) {
      riderMarker.setLatLng(latlng);
    } else {
      riderMarker = leaflet
        .circleMarker(latlng, {
          radius: 8,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 1,
          weight: 2,
        })
        .addTo(map);
    }
  }

  function clearRiderPosition(): void {
    if (riderMarker) {
      riderMarker.remove();
      riderMarker = null;
    }
  }

  function showOffRouteWarning(): void {
    offRouteBanner.hidden = false;
  }

  function hideOffRouteWarning(): void {
    offRouteBanner.hidden = true;
  }

  let poiMarkers: L.CircleMarker[] = [];

  function clearPOIs(): void {
    for (const m of poiMarkers) {
      m.remove();
    }
    poiMarkers = [];
  }

  function showPOIs(pois: POI[]): void {
    clearPOIs();
    for (const poi of pois) {
      const color = POI_COLORS[poi.type];
      const cm = leaflet
        .circleMarker([poi.lat, poi.lng], {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.8,
          weight: 2,
        })
        .addTo(map);

      const cardText =
        poi.acceptsCards === true
          ? 'Cards: Yes'
          : poi.acceptsCards === false
            ? 'Cards: No'
            : 'Cards: Unknown';
      const popupHtml = `<strong>${poi.name ?? 'Unnamed'}</strong><br>${poi.type}<br>${cardText}`;
      cm.bindPopup(popupHtml);

      poiMarkers.push(cm);
    }
  }

  let highlightMarker: L.CircleMarker | null = null;

  function highlightStop(poi: POI): void {
    clearHighlight();
    highlightMarker = leaflet
      .circleMarker([poi.lat, poi.lng], {
        radius: 10,
        color: '#f97316',
        fillColor: '#f97316',
        fillOpacity: 0.9,
        weight: 3,
      })
      .addTo(map);
  }

  function clearHighlight(): void {
    if (highlightMarker) {
      highlightMarker.remove();
      highlightMarker = null;
    }
  }

  function zoomToFit(positions: Array<{ lat: number; lng: number }>): void {
    if (positions.length === 0) return;
    const bounds = positions.map((p): [number, number] => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [50, 50] });
  }

  // Initial state: placeholder visible, map hidden
  mapDiv.hidden = true;

  return {
    showRoute,
    clear,
    destroy,
    showRiderPosition,
    clearRiderPosition,
    showOffRouteWarning,
    hideOffRouteWarning,
    showPOIs,
    clearPOIs,
    highlightStop,
    clearHighlight,
    zoomToFit,
  };
}

let defaultFactory: LeafletFactory | undefined;

export function setDefaultFactory(f: LeafletFactory): void {
  defaultFactory = f;
}

function getDefaultFactory(): LeafletFactory {
  if (defaultFactory) return defaultFactory;
  throw new Error(
    'No LeafletFactory provided. Call setDefaultFactory() or pass factory to initRouteMap().',
  );
}
