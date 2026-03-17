import type { RoutePoint } from './gpx-parser';
import { matchPosition } from './route-matcher';
import type { MatchResult } from './route-matcher';

export interface GeolocationProvider {
  watchPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): number;
  clearWatch(watchId: number): void;
}

export interface GpsState {
  position: { lat: number; lng: number } | null;
  match: MatchResult | null;
  error: 'denied' | 'unavailable' | 'timeout' | null;
}

export interface GpsTrackerHandle {
  start(route: RoutePoint[]): void;
  stop(): void;
  getState(): GpsState;
}

export function initGpsTracker(
  geo: GeolocationProvider,
  onChange: (state: GpsState) => void,
): GpsTrackerHandle {
  let state: GpsState = { position: null, match: null, error: null };
  let watchId: number | null = null;
  let route: RoutePoint[] = [];
  let lastKnownIndex: number | undefined;

  function handlePosition(pos: GeolocationPosition): void {
    const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const match = matchPosition(route, position, lastKnownIndex);

    if (
      lastKnownIndex === undefined ||
      match.nearestPointIndex >= lastKnownIndex
    ) {
      lastKnownIndex = match.nearestPointIndex;
    }

    state = { position, match, error: null };
    onChange(state);
  }

  function handleError(err: GeolocationPositionError): void {
    const errorMap: Record<number, 'denied' | 'unavailable' | 'timeout'> = {
      1: 'denied',
      2: 'unavailable',
      3: 'timeout',
    };
    state = { ...state, error: errorMap[err.code] ?? 'unavailable' };
    onChange(state);
  }

  function start(newRoute: RoutePoint[]): void {
    if (watchId !== null) {
      geo.clearWatch(watchId);
    }
    route = newRoute;
    lastKnownIndex = undefined;
    state = { position: null, match: null, error: null };
    watchId = geo.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
    });
  }

  function stop(): void {
    if (watchId !== null) {
      geo.clearWatch(watchId);
      watchId = null;
    }
  }

  function getState(): GpsState {
    return state;
  }

  return { start, stop, getState };
}
