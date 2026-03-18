import { describe, test, expect } from 'vitest';
import { rankStops } from './stop-ranker';
import type { RankDeps } from './stop-ranker';
import type { POI } from './poi-fetcher';
import type { RoutePoint } from './gpx-parser';
import type { HoursStatus } from './hours-evaluator';

function makePOI(overrides: Partial<POI> & { id: number }): POI {
  return {
    name: `POI ${overrides.id}`,
    type: 'fuel',
    lat: 50,
    lng: 10,
    openingHours: 'Mo-Su 06:00-22:00',
    acceptsCards: null,
    ...overrides,
  };
}

function makeRoute(cumDistances: number[]): RoutePoint[] {
  return cumDistances.map((d, i) => ({
    lat: 50 + i * 0.01,
    lng: 10 + i * 0.01,
    cumulativeDistance: d,
  }));
}

const route = makeRoute([0, 1000, 2000, 3000, 4000, 5000]);

// Rider is at route point index 2 (cumDist 2000)
const riderMatch = {
  isOnRoute: true,
  nearestPointIndex: 2,
  distanceFromRoute: 10,
  cumulativeDistance: 2000,
};

const riderPosition = { lat: 50.02, lng: 10.02 };

function openStatus(nextChange: Date | null = null): HoursStatus {
  return { status: 'open', nextChange, displayString: 'Open' };
}
function closedStatus(nextChange: Date | null = null): HoursStatus {
  return { status: 'closed', nextChange, displayString: 'Closed' };
}
function unknownStatus(): HoursStatus {
  return { status: 'unknown', nextChange: null, displayString: 'Hours unknown' };
}

const now = new Date('2026-03-16T10:00:00');

function makeDeps(overrides: Partial<RankDeps> = {}): RankDeps {
  return {
    evaluateHours: () => openStatus(),
    matchPosition: (_route, _pos) => ({
      isOnRoute: true,
      nearestPointIndex: 3,
      distanceFromRoute: 50,
      cumulativeDistance: 3000,
    }),
    haversine: () => 500,
    ...overrides,
  };
}

describe('rankStops', () => {
  test('empty POIs returns empty array', () => {
    const result = rankStops(
      { pois: [], route, riderMatch, riderPosition, at: now },
      makeDeps(),
    );
    expect(result).toEqual([]);
  });

  test('on-route: filters out POIs behind the rider', () => {
    const behindPoi = makePOI({ id: 1, lat: 50.01, lng: 10.01 });
    const aheadPoi = makePOI({ id: 2, lat: 50.03, lng: 10.03 });

    const deps = makeDeps({
      matchPosition: (_route, pos) => {
        // POI 1 at cumDist 1000 (behind rider at 2000)
        // POI 2 at cumDist 3000 (ahead)
        const cumDist = pos.lat === behindPoi.lat ? 1000 : 3000;
        return {
          isOnRoute: true,
          nearestPointIndex: 1,
          distanceFromRoute: 50,
          cumulativeDistance: cumDist,
        };
      },
    });

    const result = rankStops(
      { pois: [behindPoi, aheadPoi], route, riderMatch, riderPosition, at: now },
      deps,
    );
    expect(result).toHaveLength(1);
    expect(result[0].poi.id).toBe(2);
  });

  test('on-route: open stops ranked by route distance (nearer first)', () => {
    const near = makePOI({ id: 1, lat: 50.03, lng: 10.03 });
    const far = makePOI({ id: 2, lat: 50.04, lng: 10.04 });

    const deps = makeDeps({
      matchPosition: (_route, pos) => ({
        isOnRoute: true,
        nearestPointIndex: 3,
        distanceFromRoute: 50,
        cumulativeDistance: pos.lat === near.lat ? 3000 : 4000,
      }),
    });

    const result = rankStops(
      { pois: [far, near], route, riderMatch, riderPosition, at: now },
      deps,
    );
    expect(result[0].poi.id).toBe(1);
    expect(result[1].poi.id).toBe(2);
  });

  test('on-route: open before closed regardless of distance', () => {
    const closedNear = makePOI({ id: 1, lat: 50.03, lng: 10.03 });
    const openFar = makePOI({ id: 2, lat: 50.04, lng: 10.04 });

    const deps = makeDeps({
      evaluateHours: (oh) => {
        // closedNear has id 1, openFar has id 2 — differentiate by openingHours or position
        // We'll use the openingHours string itself as a signal
        return oh === 'closed' ? closedStatus() : openStatus();
      },
      matchPosition: (_route, pos) => ({
        isOnRoute: true,
        nearestPointIndex: 3,
        distanceFromRoute: 50,
        cumulativeDistance: pos.lat === closedNear.lat ? 2500 : 4000,
      }),
    });

    closedNear.openingHours = 'closed';
    openFar.openingHours = 'open';

    const result = rankStops(
      { pois: [closedNear, openFar], route, riderMatch, riderPosition, at: now },
      deps,
    );
    expect(result[0].poi.id).toBe(2); // open, even though farther
    expect(result[1].poi.id).toBe(1); // closed
  });

  test('on-route: closed stops ranked by nextChange (soonest first)', () => {
    const soonOpen = makePOI({ id: 1, lat: 50.04, lng: 10.04 });
    const laterOpen = makePOI({ id: 2, lat: 50.03, lng: 10.03 });

    const soonDate = new Date('2026-03-16T11:00:00');
    const laterDate = new Date('2026-03-16T14:00:00');

    const deps = makeDeps({
      evaluateHours: (oh) =>
        oh === 'soon'
          ? closedStatus(soonDate)
          : closedStatus(laterDate),
      matchPosition: (_route, pos) => ({
        isOnRoute: true,
        nearestPointIndex: 3,
        distanceFromRoute: 50,
        cumulativeDistance: pos.lat === soonOpen.lat ? 4000 : 3000,
      }),
    });

    soonOpen.openingHours = 'soon';
    laterOpen.openingHours = 'later';

    const result = rankStops(
      { pois: [laterOpen, soonOpen], route, riderMatch, riderPosition, at: now },
      deps,
    );
    expect(result[0].poi.id).toBe(1); // opens sooner
    expect(result[1].poi.id).toBe(2);
  });

  test('on-route: closed stops include countdown', () => {
    const poi = makePOI({ id: 1, lat: 50.03, lng: 10.03 });
    const opensAt = new Date('2026-03-16T12:15:00');

    const deps = makeDeps({
      evaluateHours: () => closedStatus(opensAt),
      matchPosition: () => ({
        isOnRoute: true,
        nearestPointIndex: 3,
        distanceFromRoute: 50,
        cumulativeDistance: 3000,
      }),
    });

    const result = rankStops(
      { pois: [poi], route, riderMatch, riderPosition, at: now },
      deps,
    );
    expect(result[0].countdown).toBe('2h 15m');
  });

  test('on-route: unknown after open and closed, sorted by route distance', () => {
    const openPoi = makePOI({ id: 1, lat: 50.03, lng: 10.03, openingHours: 'open' });
    const closedPoi = makePOI({ id: 2, lat: 50.04, lng: 10.04, openingHours: 'closed' });
    const unknownPoi = makePOI({ id: 3, lat: 50.05, lng: 10.05, openingHours: null });

    const deps = makeDeps({
      evaluateHours: (oh) => {
        if (oh === 'open') return openStatus();
        if (oh === 'closed') return closedStatus(new Date('2026-03-16T14:00:00'));
        return unknownStatus();
      },
      matchPosition: (_route, pos) => {
        const cumDist = pos.lat === openPoi.lat ? 3000
          : pos.lat === closedPoi.lat ? 3500
          : 4000;
        return {
          isOnRoute: true,
          nearestPointIndex: 3,
          distanceFromRoute: 50,
          cumulativeDistance: cumDist,
        };
      },
    });

    const result = rankStops(
      { pois: [unknownPoi, closedPoi, openPoi], route, riderMatch, riderPosition, at: now },
      deps,
    );
    expect(result[0].poi.id).toBe(1); // open
    expect(result[1].poi.id).toBe(2); // closed
    expect(result[2].poi.id).toBe(3); // unknown
  });

  test('off-route: no forward-only filter, behind-rider POIs included', () => {
    const behindPoi = makePOI({ id: 1 });

    const offRouteRider = {
      ...riderMatch,
      isOnRoute: false,
    };

    const deps = makeDeps({
      matchPosition: () => ({
        isOnRoute: true,
        nearestPointIndex: 1,
        distanceFromRoute: 50,
        cumulativeDistance: 1000, // behind rider
      }),
    });

    const result = rankStops(
      { pois: [behindPoi], route, riderMatch: offRouteRider, riderPosition, at: now },
      deps,
    );
    expect(result).toHaveLength(1);
    expect(result[0].poi.id).toBe(1);
  });

  test('off-route: sorted by straight-line distance within each tier', () => {
    const nearPoi = makePOI({ id: 1, lat: 50.01, lng: 10.01 });
    const farPoi = makePOI({ id: 2, lat: 51, lng: 11 });

    const offRouteRider = { ...riderMatch, isOnRoute: false };

    const deps = makeDeps({
      haversine: (_a, b) => (b.lat === nearPoi.lat ? 200 : 5000),
      matchPosition: () => ({
        isOnRoute: true,
        nearestPointIndex: 3,
        distanceFromRoute: 50,
        cumulativeDistance: 3000,
      }),
    });

    const result = rankStops(
      { pois: [farPoi, nearPoi], route, riderMatch: offRouteRider, riderPosition, at: now },
      deps,
    );
    expect(result[0].poi.id).toBe(1); // nearer straight-line
    expect(result[1].poi.id).toBe(2);
  });

  test('off-route: distanceAlongRoute is null', () => {
    const poi = makePOI({ id: 1 });
    const offRouteRider = { ...riderMatch, isOnRoute: false };

    const deps = makeDeps();

    const result = rankStops(
      { pois: [poi], route, riderMatch: offRouteRider, riderPosition, at: now },
      deps,
    );
    expect(result[0].distanceAlongRoute).toBeNull();
  });

  test('mixed scenario: correct ordering with various statuses', () => {
    // 5 POIs with various statuses
    const openNear = makePOI({ id: 1, lat: 50.03, lng: 10.03, openingHours: 'open' });
    const openFar = makePOI({ id: 2, lat: 50.05, lng: 10.05, openingHours: 'open' });
    const closedSoon = makePOI({ id: 3, lat: 50.04, lng: 10.04, openingHours: 'closedSoon' });
    const closedLater = makePOI({ id: 4, lat: 50.06, lng: 10.06, openingHours: 'closedLater' });
    const unknown = makePOI({ id: 5, lat: 50.07, lng: 10.07, openingHours: null });

    const deps = makeDeps({
      evaluateHours: (oh) => {
        if (oh === 'open') return openStatus();
        if (oh === 'closedSoon') return closedStatus(new Date('2026-03-16T11:00:00'));
        if (oh === 'closedLater') return closedStatus(new Date('2026-03-16T15:00:00'));
        return unknownStatus();
      },
      matchPosition: (_route, pos) => {
        const distMap: Record<number, number> = {
          [openNear.lat]: 3000,
          [openFar.lat]: 5000,
          [closedSoon.lat]: 3500,
          [closedLater.lat]: 4000,
          [unknown.lat]: 4500,
        };
        return {
          isOnRoute: true,
          nearestPointIndex: 3,
          distanceFromRoute: 50,
          cumulativeDistance: distMap[pos.lat] ?? 3000,
        };
      },
    });

    const result = rankStops(
      {
        pois: [unknown, closedLater, openFar, closedSoon, openNear],
        route,
        riderMatch,
        riderPosition,
        at: now,
      },
      deps,
    );

    // Expected: open by distance, then closed by nextChange, then unknown
    expect(result.map((r) => r.poi.id)).toEqual([1, 2, 3, 4, 5]);
  });
});
