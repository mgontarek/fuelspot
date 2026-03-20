import type { ParsedRoute, RoutePoint } from './gpx-parser';
import type { POI, OverpassClient } from './poi-fetcher';
import { createOverpassClient, createCachedFetcher } from './poi-fetcher';
import type { MatchResult } from './route-matcher';
import { matchPosition as defaultMatchPosition } from './route-matcher';
import type { RankedStop } from './stop-ranker';
import { rankStops as defaultRankStops } from './stop-ranker';
import type { HoursParser } from './hours-evaluator';
import {
  evaluateHours as defaultEvaluateHours,
  createOpeningHoursParser,
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
  rankStops: typeof defaultRankStops;
  evaluateHours: typeof defaultEvaluateHours;
  matchPosition: typeof defaultMatchPosition;
  haversine: typeof defaultHaversine;
  createOpeningHoursParser: () => HoursParser;
}

export interface SearchPipelineHandle {
  run(route: ParsedRoute, getGpsState: GetGpsState, i18n?: I18n): Promise<SearchResult>;
  readonly isRunning: boolean;
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
