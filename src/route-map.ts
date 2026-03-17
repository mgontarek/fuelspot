import type { ParsedRoute } from './gpx-parser';
import type * as L from 'leaflet';

export interface RouteMapHandle {
  showRoute(route: ParsedRoute): void;
  clear(): void;
  destroy(): void;
}

export interface LeafletFactory {
  map(container: HTMLElement, options?: L.MapOptions): L.Map;
  tileLayer(urlTemplate: string, options?: L.TileLayerOptions): L.TileLayer;
  polyline(
    latlngs: L.LatLngExpression[],
    options?: L.PolylineOptions,
  ): L.Polyline;
  marker(latlng: L.LatLngExpression, options?: L.MarkerOptions): L.Marker;
}

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

  // Initial state: placeholder visible, map hidden
  mapDiv.hidden = true;

  return { showRoute, clear, destroy };
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
