import { describe, it, expect, vi } from 'vitest';
import { createSearchPipeline } from './search-pipeline';
import type { SearchDeps, GetGpsState } from './search-pipeline';
import type { ParsedRoute } from './gpx-parser';
import type { MatchResult } from './route-matcher';

const dummyRoute: ParsedRoute = {
  name: 'Test',
  points: [
    { lat: 50, lng: 20, cumulativeDistance: 0 },
    { lat: 50.01, lng: 20.01, cumulativeDistance: 1000 },
  ],
  totalDistance: 1000,
};

const dummyMatch: MatchResult = {
  isOnRoute: true,
  nearestPointIndex: 0,
  distanceFromRoute: 10,
  cumulativeDistance: 500,
};

const dummyPoi = {
  id: 1,
  name: 'Test POI',
  type: 'fuel' as const,
  lat: 50.005,
  lng: 20.005,
  openingHours: null,
  acceptsCards: null,
};

const dummyRankedStop = {
  poi: dummyPoi,
  hours: { status: 'unknown' as const, nextChange: null, displayString: 'Hours unknown' },
  distanceAlongRoute: 500,
  straightLineDistance: 300,
  countdown: null,
};

function createStubDeps(overrides?: Partial<SearchDeps>): SearchDeps {
  return {
    fetchPOIs: vi.fn().mockResolvedValue([dummyPoi]),
    rankStops: vi.fn().mockReturnValue([dummyRankedStop]),
    evaluateHours: vi.fn().mockReturnValue({ status: 'unknown', nextChange: null, displayString: 'Hours unknown' }),
    matchPosition: vi.fn().mockReturnValue(dummyMatch),
    haversine: vi.fn().mockReturnValue(300),
    createOpeningHoursParser: vi.fn().mockReturnValue({ evaluate: vi.fn() }),
    ...overrides,
  };
}

function createGpsState(
  position: { lat: number; lng: number } | null = { lat: 50, lng: 20 },
  match: MatchResult | null = dummyMatch,
): GetGpsState {
  return () => ({ position, match });
}

describe('search pipeline', () => {
  it('returns no-gps when getGpsState returns undefined', async () => {
    const deps = createStubDeps();
    const pipeline = createSearchPipeline(deps);

    const result = await pipeline.run(dummyRoute, () => undefined);

    expect(result).toEqual({ status: 'no-gps' });
    expect(deps.fetchPOIs).not.toHaveBeenCalled();
  });

  it('returns no-gps when position is null', async () => {
    const deps = createStubDeps();
    const pipeline = createSearchPipeline(deps);

    const result = await pipeline.run(dummyRoute, createGpsState(null));

    expect(result).toEqual({ status: 'no-gps' });
  });

  it('returns busy when already in-flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    const deps = createStubDeps({
      fetchPOIs: vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveFetch = resolve; }),
      ),
    });
    const pipeline = createSearchPipeline(deps);

    // Start first run (will suspend on fetchPOIs)
    const firstRun = pipeline.run(dummyRoute, createGpsState());

    // Second run while first is in-flight
    const result = await pipeline.run(dummyRoute, createGpsState());

    expect(result).toEqual({ status: 'busy' });
    expect(pipeline.isRunning).toBe(true);

    // Clean up
    resolveFetch([]);
    await firstRun;
  });

  it('returns ok with ranked stops on success', async () => {
    const deps = createStubDeps();
    const pipeline = createSearchPipeline(deps);

    const result = await pipeline.run(dummyRoute, createGpsState());

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.ranked).toEqual([dummyRankedStop]);
      expect(result.pois).toEqual([dummyPoi]);
      expect(result.position).toEqual({ lat: 50, lng: 20 });
    }
  });

  it('returns ok with empty ranked array when no stops found', async () => {
    const deps = createStubDeps({
      rankStops: vi.fn().mockReturnValue([]),
    });
    const pipeline = createSearchPipeline(deps);

    const result = await pipeline.run(dummyRoute, createGpsState());

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.ranked).toEqual([]);
    }
  });

  it('returns error with message when fetchPOIs rejects', async () => {
    const deps = createStubDeps({
      fetchPOIs: vi.fn().mockRejectedValue(new Error('Network failure')),
    });
    const pipeline = createSearchPipeline(deps);

    const result = await pipeline.run(dummyRoute, createGpsState());

    expect(result).toEqual({ status: 'error', message: 'Network failure' });
  });

  it('returns error with generic message for non-Error throws', async () => {
    const deps = createStubDeps({
      fetchPOIs: vi.fn().mockRejectedValue('string error'),
    });
    const pipeline = createSearchPipeline(deps);

    const result = await pipeline.run(dummyRoute, createGpsState());

    expect(result).toEqual({ status: 'error', message: 'Failed to load stops' });
  });

  it('uses fresher GPS position after fetch (double-read)', async () => {
    const deps = createStubDeps();
    let callCount = 0;
    const getGpsState: GetGpsState = () => {
      callCount++;
      if (callCount === 1) {
        return { position: { lat: 50, lng: 20 }, match: dummyMatch };
      }
      // Fresher position on second read
      return { position: { lat: 50.001, lng: 20.001 }, match: dummyMatch };
    };

    const pipeline = createSearchPipeline(deps);
    const result = await pipeline.run(dummyRoute, getGpsState);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.position).toEqual({ lat: 50.001, lng: 20.001 });
    }
    // rankStops should receive the fresher position
    expect(deps.rankStops).toHaveBeenCalledWith(
      expect.objectContaining({ riderPosition: { lat: 50.001, lng: 20.001 } }),
      expect.any(Object),
    );
  });

  it('resets inFlight after error (next run succeeds)', async () => {
    const fetchPOIs = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce([dummyPoi]);
    const deps = createStubDeps({ fetchPOIs });
    const pipeline = createSearchPipeline(deps);

    const first = await pipeline.run(dummyRoute, createGpsState());
    expect(first.status).toBe('error');
    expect(pipeline.isRunning).toBe(false);

    const second = await pipeline.run(dummyRoute, createGpsState());
    expect(second.status).toBe('ok');
  });

  it('passes i18n through to evaluateHours', async () => {
    const deps = createStubDeps();
    const pipeline = createSearchPipeline(deps);
    const fakeI18n = { t: vi.fn(), locale: vi.fn(), setLocale: vi.fn(), onChange: vi.fn() } as unknown as import('./i18n').I18n;

    await pipeline.run(dummyRoute, createGpsState(), fakeI18n);

    // rankStops is called with a deps object whose evaluateHours wraps our dep
    const rankCall = vi.mocked(deps.rankStops).mock.calls[0];
    const rankDeps = rankCall[1];

    // Call the evaluateHours passed to rankStops to verify i18n is forwarded
    rankDeps.evaluateHours('Mo-Fr 08:00-20:00', new Date());

    expect(deps.evaluateHours).toHaveBeenCalledWith(
      'Mo-Fr 08:00-20:00',
      expect.any(Date),
      expect.any(Object), // hoursParser
      fakeI18n,
    );
  });

  it('creates hoursParser once and reuses across runs', async () => {
    const deps = createStubDeps();
    const pipeline = createSearchPipeline(deps);

    await pipeline.run(dummyRoute, createGpsState());
    await pipeline.run(dummyRoute, createGpsState());

    // createOpeningHoursParser called once during factory creation
    expect(deps.createOpeningHoursParser).toHaveBeenCalledTimes(1);
  });
});
