import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initGpsTracker } from './gps-tracker';
import type {
  GeolocationProvider,
  GpsTrackerHandle,
  GpsState,
} from './gps-tracker';
import type { RoutePoint } from './gpx-parser';
import { haversine } from './geo';

function straightRoute(): RoutePoint[] {
  const pts = [
    { lat: 50, lng: 20 },
    { lat: 50, lng: 20.01 },
    { lat: 50, lng: 20.02 },
    { lat: 50, lng: 20.03 },
    { lat: 50, lng: 20.04 },
  ];
  let cumulative = 0;
  return pts.map((p, i) => {
    if (i > 0) cumulative += haversine(pts[i - 1], p);
    return { ...p, cumulativeDistance: cumulative };
  });
}

function createMockGeo() {
  let successCb: PositionCallback | null = null;
  let errorCb: PositionErrorCallback | null = null;
  let nextId = 1;

  const geo: GeolocationProvider = {
    watchPosition: vi.fn((success, error, _options) => {
      successCb = success;
      errorCb = error ?? null;
      return nextId++;
    }),
    clearWatch: vi.fn(),
  };

  function simulatePosition(lat: number, lng: number): void {
    successCb!({
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition);
  }

  function simulateError(code: number): void {
    errorCb!({ code, message: 'test error' } as GeolocationPositionError);
  }

  return { geo, simulatePosition, simulateError };
}

describe('gps-tracker', () => {
  let mockGeo: ReturnType<typeof createMockGeo>;
  let onChange: ReturnType<typeof vi.fn<(state: GpsState) => void>>;
  let handle: GpsTrackerHandle;

  beforeEach(() => {
    mockGeo = createMockGeo();
    onChange = vi.fn<(state: GpsState) => void>();
    handle = initGpsTracker(mockGeo.geo, onChange);
  });

  // Slice 9: Module shape
  it('returns handle with start, stop, getState', () => {
    expect(typeof handle.start).toBe('function');
    expect(typeof handle.stop).toBe('function');
    expect(typeof handle.getState).toBe('function');
  });

  // Slice 10: start() calls watchPosition with enableHighAccuracy
  it('calls watchPosition with enableHighAccuracy on start', () => {
    handle.start(straightRoute());
    expect(mockGeo.geo.watchPosition).toHaveBeenCalledOnce();
    const options = vi.mocked(mockGeo.geo.watchPosition).mock.calls[0][2];
    expect(options).toMatchObject({ enableHighAccuracy: true });
  });

  // Slice 11: Position update triggers onChange
  it('triggers onChange with position and match result', () => {
    handle.start(straightRoute());
    mockGeo.simulatePosition(50, 20.01);

    expect(onChange).toHaveBeenCalledOnce();
    const state: GpsState = onChange.mock.calls[0][0];
    expect(state.position).toEqual({ lat: 50, lng: 20.01 });
    expect(state.match).not.toBeNull();
    expect(state.match!.isOnRoute).toBe(true);
    expect(state.error).toBeNull();
  });

  // Slice 12: Forward progression maintained
  it('maintains forward progression across updates', () => {
    handle.start(straightRoute());

    mockGeo.simulatePosition(50, 20.02);
    const first = onChange.mock.calls[0][0] as GpsState;

    mockGeo.simulatePosition(50, 20.03);
    const second = onChange.mock.calls[1][0] as GpsState;

    expect(second.match!.nearestPointIndex).toBeGreaterThanOrEqual(
      first.match!.nearestPointIndex,
    );
  });

  // Slice 13: Error — permission denied
  it('sets error to denied on code 1', () => {
    handle.start(straightRoute());
    mockGeo.simulateError(1);

    expect(onChange).toHaveBeenCalledOnce();
    const state: GpsState = onChange.mock.calls[0][0];
    expect(state.error).toBe('denied');
  });

  // Slice 14: Error — unavailable
  it('sets error to unavailable on code 2', () => {
    handle.start(straightRoute());
    mockGeo.simulateError(2);

    const state: GpsState = onChange.mock.calls[0][0];
    expect(state.error).toBe('unavailable');
  });

  // Slice 15: stop() clears the watch
  it('calls clearWatch on stop', () => {
    handle.start(straightRoute());
    handle.stop();
    expect(mockGeo.geo.clearWatch).toHaveBeenCalledOnce();
  });

  // Slice 16: start() after stop() resets state
  it('resets state when start called after stop', () => {
    handle.start(straightRoute());
    mockGeo.simulatePosition(50, 20.03);
    handle.stop();

    handle.start(straightRoute());
    const state = handle.getState();
    expect(state.position).toBeNull();
    expect(state.match).toBeNull();
    expect(state.error).toBeNull();
  });

  // #38: GPS tracker optional route support
  it('emits position with null match when started without route', () => {
    handle.start();
    mockGeo.simulatePosition(50, 20.01);

    expect(onChange).toHaveBeenCalledOnce();
    const state: GpsState = onChange.mock.calls[0][0];
    expect(state.position).toEqual({ lat: 50, lng: 20.01 });
    expect(state.match).toBeNull();
    expect(state.error).toBeNull();
  });

  it('matches route after restarting with route points', () => {
    handle.start();
    mockGeo.simulatePosition(50, 20.01);

    handle.start(straightRoute());
    mockGeo.simulatePosition(50, 20.02);

    const state: GpsState = onChange.mock.calls[1][0];
    expect(state.match).not.toBeNull();
    expect(state.match!.isOnRoute).toBe(true);
  });
});
