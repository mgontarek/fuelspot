import { describe, it, expect } from 'vitest';
import { matchPosition } from './route-matcher';
import type { MatchResult } from './route-matcher';
import type { RoutePoint } from './gpx-parser';
import { haversine } from './geo';

// Helper: build a straight route along a line of latitude
function straightRoute(
  startLat: number,
  startLng: number,
  points: number,
  spacingDeg: number,
): RoutePoint[] {
  const route: RoutePoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < points; i++) {
    const p = { lat: startLat, lng: startLng + i * spacingDeg };
    if (i > 0) {
      cumulative += haversine(route[i - 1], p);
    }
    route.push({ ...p, cumulativeDistance: cumulative });
  }
  return route;
}

describe('route-matcher', () => {
  // Slice 1: Module shape
  it('returns object with all MatchResult fields', () => {
    const route = straightRoute(50, 20, 3, 0.01);
    const result: MatchResult = matchPosition(route, { lat: 50, lng: 20.01 });
    expect(result).toHaveProperty('isOnRoute');
    expect(result).toHaveProperty('nearestPointIndex');
    expect(result).toHaveProperty('distanceFromRoute');
    expect(result).toHaveProperty('cumulativeDistance');
  });

  // Slice 2: Nearest point on straight route
  it('returns index 1, distance ~0 when position is exactly on point 1', () => {
    const route = straightRoute(50, 20, 3, 0.01);
    const result = matchPosition(route, { lat: 50, lng: 20.01 });
    expect(result.nearestPointIndex).toBe(1);
    expect(result.distanceFromRoute).toBeLessThan(1); // < 1m
    expect(result.isOnRoute).toBe(true);
  });

  // Slice 3: Off-route detection
  it('marks position 1km from route as off-route', () => {
    const route = straightRoute(50, 20, 3, 0.01);
    // ~0.009 degrees latitude ≈ 1km
    const result = matchPosition(route, { lat: 50.009, lng: 20.01 });
    expect(result.isOnRoute).toBe(false);
    expect(result.distanceFromRoute).toBeGreaterThan(900);
    expect(result.distanceFromRoute).toBeLessThan(1100);
  });

  // Slice 4: Between-point interpolation
  it('computes correct cumulativeDistance for midpoint of segment', () => {
    const route = straightRoute(50, 20, 3, 0.01);
    // Halfway between point 0 and point 1
    const result = matchPosition(route, { lat: 50, lng: 20.005 });
    const expectedCumDist =
      (route[0].cumulativeDistance + route[1].cumulativeDistance) / 2;
    expect(result.cumulativeDistance).toBeCloseTo(expectedCumDist, 0);
    expect(result.isOnRoute).toBe(true);
  });

  // Slice 5: Boundary — 499m vs 501m
  it('499m from route is on-route', () => {
    const route = straightRoute(50, 20, 3, 0.01);
    // 499m north of the route ≈ 0.00449 degrees latitude
    const offsetLat = 499 / 111_320;
    const result = matchPosition(route, {
      lat: 50 + offsetLat,
      lng: 20.01,
    });
    expect(result.isOnRoute).toBe(true);
  });

  it('501m from route is off-route', () => {
    const route = straightRoute(50, 20, 3, 0.01);
    const offsetLat = 501 / 111_320;
    const result = matchPosition(route, {
      lat: 50 + offsetLat,
      lng: 20.01,
    });
    expect(result.isOnRoute).toBe(false);
  });

  // Slice 6: Forward progression with lastKnownIndex hint
  it('resolves to forward point when lastKnownIndex is provided', () => {
    // Create a route that goes east then comes back west (loop-like)
    const route: RoutePoint[] = [];
    let cumulative = 0;
    const pts = [
      { lat: 50, lng: 20 },
      { lat: 50, lng: 20.01 },
      { lat: 50.005, lng: 20.02 },
      { lat: 50.01, lng: 20.01 }, // passes near lng 20.01 again
      { lat: 50.01, lng: 20 },
    ];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) cumulative += haversine(pts[i - 1], pts[i]);
      route.push({ ...pts[i], cumulativeDistance: cumulative });
    }

    // Position near lng 20.01 — without hint, could match segment 0-1 or 2-3
    // With lastKnownIndex=2, should prefer the forward segment 2-3
    const result = matchPosition(
      route,
      { lat: 50.008, lng: 20.012 },
      2,
    );
    expect(result.nearestPointIndex).toBeGreaterThanOrEqual(2);
  });

  // Slice 7: Out-and-back — lastKnownIndex near turnaround
  it('handles out-and-back route with lastKnownIndex near turnaround', () => {
    const route: RoutePoint[] = [];
    let cumulative = 0;
    // Out: 0->1->2, Back: 2->3->4 (3 and 4 retrace path)
    const pts = [
      { lat: 50, lng: 20 },
      { lat: 50, lng: 20.01 },
      { lat: 50, lng: 20.02 }, // turnaround
      { lat: 50, lng: 20.01 }, // same as point 1
      { lat: 50, lng: 20 }, // same as point 0
    ];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) cumulative += haversine(pts[i - 1], pts[i]);
      route.push({ ...pts[i], cumulativeDistance: cumulative });
    }

    // Near turnaround, hint index 2
    const result = matchPosition(route, { lat: 50, lng: 20.019 }, 2);
    expect(result.nearestPointIndex).toBeGreaterThanOrEqual(2);
    expect(result.isOnRoute).toBe(true);
  });

  // Slice 8: Edge cases
  it('handles single-point route', () => {
    const route: RoutePoint[] = [
      { lat: 50, lng: 20, cumulativeDistance: 0 },
    ];
    const result = matchPosition(route, { lat: 50, lng: 20 });
    expect(result.nearestPointIndex).toBe(0);
    expect(result.distanceFromRoute).toBeLessThan(1);
    expect(result.isOnRoute).toBe(true);
  });

  it('handles position on first point', () => {
    const route = straightRoute(50, 20, 5, 0.01);
    const result = matchPosition(route, { lat: 50, lng: 20 });
    expect(result.nearestPointIndex).toBe(0);
    expect(result.distanceFromRoute).toBeLessThan(1);
    expect(result.cumulativeDistance).toBeCloseTo(0, 0);
  });

  it('handles position on last point', () => {
    const route = straightRoute(50, 20, 5, 0.01);
    const lastPt = route[route.length - 1];
    const result = matchPosition(route, { lat: lastPt.lat, lng: lastPt.lng });
    expect(result.nearestPointIndex).toBe(4);
    expect(result.distanceFromRoute).toBeLessThan(1);
    expect(result.cumulativeDistance).toBeCloseTo(lastPt.cumulativeDistance, 0);
  });
});
