import type { RoutePoint } from './gpx-parser';
import { haversine } from './geo';

const OFF_ROUTE_THRESHOLD = 500; // meters

export interface MatchResult {
  isOnRoute: boolean;
  nearestPointIndex: number;
  distanceFromRoute: number;
  cumulativeDistance: number;
}

export function matchPosition(
  route: RoutePoint[],
  position: { lat: number; lng: number },
  lastKnownIndex?: number,
): MatchResult {
  if (route.length === 0) {
    return {
      isOnRoute: false,
      nearestPointIndex: 0,
      distanceFromRoute: Infinity,
      cumulativeDistance: 0,
    };
  }

  if (route.length === 1) {
    const dist = haversine(route[0], position);
    return {
      isOnRoute: dist <= OFF_ROUTE_THRESHOLD,
      nearestPointIndex: 0,
      distanceFromRoute: dist,
      cumulativeDistance: route[0].cumulativeDistance,
    };
  }

  // If lastKnownIndex provided, try windowed search first
  if (lastKnownIndex !== undefined) {
    const windowResult = searchSegments(
      route,
      position,
      Math.max(0, lastKnownIndex - 5),
      Math.min(route.length - 1, lastKnownIndex + 50),
    );
    if (windowResult.distanceFromRoute <= OFF_ROUTE_THRESHOLD) {
      return { ...windowResult, isOnRoute: true };
    }
  }

  // Full scan
  const result = searchSegments(route, position, 0, route.length - 1);
  return {
    ...result,
    isOnRoute: result.distanceFromRoute <= OFF_ROUTE_THRESHOLD,
  };
}

function searchSegments(
  route: RoutePoint[],
  position: { lat: number; lng: number },
  startIdx: number,
  endIdx: number,
): Omit<MatchResult, 'isOnRoute'> {
  let bestDist = Infinity;
  let bestIndex = startIdx;
  let bestCumulativeDist = route[startIdx].cumulativeDistance;

  for (let i = startIdx; i < endIdx; i++) {
    const a = route[i];
    const b = route[i + 1];

    // Project position onto segment using cosine-corrected Cartesian approximation
    const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
    const ax = a.lng * cosLat;
    const ay = a.lat;
    const bx = b.lng * cosLat;
    const by = b.lat;
    const px = position.lng * cosLat;
    const py = position.lat;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }

    // Projected point in real coordinates
    const projLat = a.lat + t * (b.lat - a.lat);
    const projLng = a.lng + t * (b.lng - a.lng);

    const dist = haversine(position, { lat: projLat, lng: projLng });

    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = t <= 0.5 ? i : i + 1;
      bestCumulativeDist =
        a.cumulativeDistance +
        t * (b.cumulativeDistance - a.cumulativeDistance);
    }
  }

  return {
    nearestPointIndex: bestIndex,
    distanceFromRoute: bestDist,
    cumulativeDistance: bestCumulativeDist,
  };
}
