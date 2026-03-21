import type { ParsedRoute, RoutePoint } from './gpx-parser';
import type { POI, OverpassClient } from './poi-fetcher';
import {
  createOverpassClient,
  createCachedFetcher,
  buildProximityQuery,
  parseOverpassResponse,
} from './poi-fetcher';
import type { MatchResult } from './route-matcher';
import { matchPosition as defaultMatchPosition } from './route-matcher';
import type { RankedStop } from './stop-ranker';
import { rankStops as defaultRankStops } from './stop-ranker';
import type { HoursParser } from './hours-evaluator';
import {
  evaluateHours as defaultEvaluateHours,
  createOpeningHoursParser,
  formatCountdown,
} from './hours-evaluator';
import { haversine as defaultHaversine } from './geo';
import type { I18n } from './i18n';

export type SearchResult =
  | { status: 'ok'; ranked: RankedStop[]; pois: POI[]; position: { lat: number; lng: number } }
  | { status: 'no-gps' }
  | { status: 'busy' }
  | { status: 'error'; message: string };

export type GetGpsState = () =>
  | { position: { lat: number; lng: number } | null; match: MatchResult | null }
  | undefined;

export interface SearchDeps {
  fetchPOIs: (points: RoutePoint[]) => Promise<POI[]>;
  fetchProximityPOIs: (lat: number, lng: number, radius: number) => Promise<POI[]>;
  rankStops: typeof defaultRankStops;
  evaluateHours: typeof defaultEvaluateHours;
  matchPosition: typeof defaultMatchPosition;
  haversine: typeof defaultHaversine;
  createOpeningHoursParser: () => HoursParser;
}

export interface SearchPipelineHandle {
  run(route: ParsedRoute, getGpsState: GetGpsState, i18n?: I18n): Promise<SearchResult>;
  runProximity(position: { lat: number; lng: number } | null, i18n?: I18n): Promise<SearchResult>;
  readonly isRunning: boolean;
}

const PROXIMITY_RADIUS_METERS = 5000;

function selectProximityStops(enriched: RankedStop[]): RankedStop[] {
  const nonClosed = enriched
    .filter((s) => s.hours.status !== 'closed')
    .sort((a, b) => a.straightLineDistance - b.straightLineDistance);

  const nearestOpen = nonClosed.find((s) => s.hours.status === 'open') ?? null;
  const nearestUnknown = nonClosed.find((s) => s.hours.status === 'unknown') ?? null;

  if (nearestOpen && nearestUnknown) {
    return [nearestOpen, nearestUnknown];
  }

  if (!nearestOpen) {
    return nonClosed.filter((s) => s.hours.status === 'unknown').slice(0, 2);
  }

  return [nearestOpen];
}

export function createSearchPipeline(deps: SearchDeps): SearchPipelineHandle {
  const hoursParser = deps.createOpeningHoursParser();
  let inFlight = false;

  return {
    get isRunning() {
      return inFlight;
    },

    async run(route, getGpsState, i18n?) {
      if (inFlight) return { status: 'busy' };

      const gpsState = getGpsState();
      if (!gpsState?.position) return { status: 'no-gps' };

      inFlight = true;
      try {
        const pois = await deps.fetchPOIs(route.points);

        // Double-read: get fresher GPS after fetch
        const gpsStateNow = getGpsState();
        const position = gpsStateNow?.position ?? gpsState.position;
        const match =
          gpsStateNow?.match ?? deps.matchPosition(route.points, position);

        const ranked = deps.rankStops(
          {
            pois,
            route: route.points,
            riderMatch: match,
            riderPosition: position,
            at: new Date(),
          },
          {
            evaluateHours: (oh, at) => deps.evaluateHours(oh, at, hoursParser, i18n),
            matchPosition: deps.matchPosition,
            haversine: deps.haversine,
          },
        );

        return { status: 'ok', ranked, pois, position };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load stops';
        return { status: 'error', message };
      } finally {
        inFlight = false;
      }
    },

    async runProximity(position, i18n?) {
      if (!position) return { status: 'no-gps' };
      if (inFlight) return { status: 'busy' };

      inFlight = true;
      try {
        const pois = await deps.fetchProximityPOIs(position.lat, position.lng, PROXIMITY_RADIUS_METERS);

        const now = new Date();
        const enriched: RankedStop[] = pois.map((poi) => {
          const hours = deps.evaluateHours(poi.openingHours, now, hoursParser, i18n);
          const straightLineDistance = deps.haversine(position, { lat: poi.lat, lng: poi.lng });
          const countdown =
            hours.status === 'closed' && hours.nextChange
              ? formatCountdown(now, hours.nextChange, i18n)
              : null;
          return { poi, hours, distanceAlongRoute: null, straightLineDistance, countdown };
        });

        const ranked = selectProximityStops(enriched);
        return { status: 'ok', ranked, pois, position };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load stops';
        return { status: 'error', message };
      } finally {
        inFlight = false;
      }
    },
  };
}

export interface DefaultSearchPipelineHandle extends SearchPipelineHandle {
  clearCache(): void;
}

export function createDefaultSearchPipeline(
  client?: OverpassClient,
): DefaultSearchPipelineHandle {
  const resolvedClient = client ?? createOverpassClient();
  const cachedFetcher = createCachedFetcher(resolvedClient);

  const pipeline = createSearchPipeline({
    fetchPOIs: (points) => cachedFetcher.fetch(points),
    fetchProximityPOIs: async (lat, lng, radius) => {
      const query = buildProximityQuery(lat, lng, radius);
      const response = await resolvedClient.query(query);
      return parseOverpassResponse(response);
    },
    rankStops: defaultRankStops,
    evaluateHours: defaultEvaluateHours,
    matchPosition: defaultMatchPosition,
    haversine: defaultHaversine,
    createOpeningHoursParser,
  });

  return {
    ...pipeline,
    clearCache() {
      cachedFetcher.clear();
    },
  };
}
