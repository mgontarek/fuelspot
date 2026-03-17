import { haversine } from './geo';

export interface RoutePoint {
  lat: number;
  lng: number;
  cumulativeDistance: number;
}

export interface ParsedRoute {
  name: string | null;
  points: RoutePoint[];
  totalDistance: number;
}

export function parseGPX(gpxString: string): ParsedRoute {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid GPX');
  }

  const gpxEl = doc.querySelector('gpx');
  if (!gpxEl) {
    throw new Error('Invalid GPX');
  }

  const points = extractPoints(doc);
  if (points.length === 0) {
    throw new Error('No route points found');
  }

  const name = extractName(doc);
  const routePoints = computeDistances(points);
  const totalDistance =
    routePoints.length > 0
      ? routePoints[routePoints.length - 1].cumulativeDistance
      : 0;

  return { name, points: routePoints, totalDistance };
}

function extractPoints(
  doc: Document,
): Array<{ lat: number; lng: number }> {
  const GPX_NS = 'http://www.topografix.com/GPX/1/1';

  // Try trkpt first (tracks)
  let elements = doc.getElementsByTagNameNS(GPX_NS, 'trkpt');
  if (elements.length === 0) {
    elements = doc.getElementsByTagName('trkpt');
  }

  // Fall back to rtept (routes)
  if (elements.length === 0) {
    elements = doc.getElementsByTagNameNS(GPX_NS, 'rtept');
    if (elements.length === 0) {
      elements = doc.getElementsByTagName('rtept');
    }
  }

  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const lat = parseFloat(el.getAttribute('lat') ?? '');
    const lng = parseFloat(el.getAttribute('lon') ?? '');
    if (!isNaN(lat) && !isNaN(lng)) {
      points.push({ lat, lng });
    }
  }
  return points;
}

function extractName(doc: Document): string | null {
  // Look for name inside trk first, then rte, then metadata
  const trk = doc.querySelector('trk');
  if (trk) {
    const name = trk.querySelector('name');
    if (name?.textContent) return name.textContent;
  }

  const rte = doc.querySelector('rte');
  if (rte) {
    const name = rte.querySelector('name');
    if (name?.textContent) return name.textContent;
  }

  const metadata = doc.querySelector('metadata');
  if (metadata) {
    const name = metadata.querySelector('name');
    if (name?.textContent) return name.textContent;
  }

  return null;
}

function computeDistances(
  points: Array<{ lat: number; lng: number }>,
): RoutePoint[] {
  let cumulative = 0;
  return points.map((p, i) => {
    if (i > 0) {
      cumulative += haversine(points[i - 1], p);
    }
    return { lat: p.lat, lng: p.lng, cumulativeDistance: cumulative };
  });
}

