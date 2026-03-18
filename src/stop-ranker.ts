import type { POI } from './poi-fetcher';
import type { RoutePoint } from './gpx-parser';
import type { MatchResult } from './route-matcher';
import type { HoursStatus } from './hours-evaluator';
import { formatCountdown } from './hours-evaluator';

export interface RankedStop {
  poi: POI;
  hours: HoursStatus;
  distanceAlongRoute: number | null;
  straightLineDistance: number;
  countdown: string | null;
}

export interface RankDeps {
  evaluateHours: (openingHours: string | null, at: Date) => HoursStatus;
  matchPosition: (route: RoutePoint[], position: { lat: number; lng: number }) => MatchResult;
  haversine: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
}

const STATUS_PRIORITY: Record<HoursStatus['status'], number> = {
  open: 0,
  closed: 1,
  unknown: 2,
};

export function rankStops(
  params: {
    pois: POI[];
    route: RoutePoint[];
    riderMatch: MatchResult;
    riderPosition: { lat: number; lng: number };
    at: Date;
  },
  deps: RankDeps,
): RankedStop[] {
  const { pois, route, riderMatch, riderPosition, at } = params;
  const isOnRoute = riderMatch.isOnRoute;

  const enriched: RankedStop[] = [];

  for (const poi of pois) {
    const poiMatch = deps.matchPosition(route, { lat: poi.lat, lng: poi.lng });
    const hours = deps.evaluateHours(poi.openingHours, at);
    const straightLineDistance = deps.haversine(riderPosition, { lat: poi.lat, lng: poi.lng });

    // On-route: filter out POIs behind the rider
    if (isOnRoute && poiMatch.cumulativeDistance <= riderMatch.cumulativeDistance) {
      continue;
    }

    const distanceAlongRoute = isOnRoute
      ? poiMatch.cumulativeDistance - riderMatch.cumulativeDistance
      : null;

    const countdown =
      hours.status === 'closed' && hours.nextChange
        ? formatCountdown(at, hours.nextChange)
        : null;

    enriched.push({
      poi,
      hours,
      distanceAlongRoute,
      straightLineDistance,
      countdown,
    });
  }

  enriched.sort((a, b) => {
    // Primary: status tier (open > closed > unknown)
    const tierDiff = STATUS_PRIORITY[a.hours.status] - STATUS_PRIORITY[b.hours.status];
    if (tierDiff !== 0) return tierDiff;

    // Within closed tier: sort by nextChange (soonest first)
    if (a.hours.status === 'closed' && b.hours.status === 'closed') {
      if (a.hours.nextChange && b.hours.nextChange) {
        const timeDiff = a.hours.nextChange.getTime() - b.hours.nextChange.getTime();
        if (timeDiff !== 0) return timeDiff;
      }
      // One without nextChange goes after
      if (a.hours.nextChange && !b.hours.nextChange) return -1;
      if (!a.hours.nextChange && b.hours.nextChange) return 1;
    }

    // Within same tier: sort by distance
    if (isOnRoute) {
      return (a.distanceAlongRoute ?? 0) - (b.distanceAlongRoute ?? 0);
    }
    return a.straightLineDistance - b.straightLineDistance;
  });

  return enriched;
}
