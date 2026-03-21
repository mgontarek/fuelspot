import { describe, it, expect, vi } from 'vitest';
import type { RoutePoint } from './gpx-parser';
import {
  buildOverpassQuery,
  buildProximityQuery,
  parseOverpassResponse,
  fetchPOIs,
  createOverpassClient,
  createCachedFetcher,
} from './poi-fetcher';
import type { OverpassClient, OverpassResponse } from './poi-fetcher';

function makePoints(count: number): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 50 + i * 0.01,
    lng: 20 + i * 0.01,
    cumulativeDistance: i * 100,
  }));
}

describe('buildOverpassQuery', () => {
  // Slice 1: produces valid Overpass QL with all 6 POI categories
  it('contains all 6 POI categories and coordinate pairs', () => {
    const points = makePoints(3);
    const query = buildOverpassQuery(points);

    expect(query).toContain('"amenity"="fuel"');
    expect(query).toContain('"shop"="convenience"');
    expect(query).toContain('"shop"="supermarket"');
    expect(query).toContain('"shop"="bakery"');
    expect(query).toContain('"amenity"="restaurant"');
    expect(query).toContain('"amenity"="cafe"');

    for (const p of points) {
      expect(query).toContain(`${p.lat}`);
      expect(query).toContain(`${p.lng}`);
    }

    expect(query).toContain('around:300');
    expect(query).toContain('out center body');
    expect(query).toContain('[out:json]');
    expect(query).toContain('[timeout:30]');
  });

  // Slice 2: samples points when route has many points
  it('samples points for large routes', () => {
    const points = makePoints(500);
    const query = buildOverpassQuery(points);

    // Should have fewer coordinate pairs than 500
    const coordMatches = query.match(/\d+\.\d+,\d+\.\d+/g) ?? [];
    // Each nwr line has the same coords, so divide by 6 categories
    const uniqueCoordCount = coordMatches.length / 6;
    expect(uniqueCoordCount).toBeLessThan(500);
    expect(uniqueCoordCount).toBeGreaterThan(0);

    // Should always include first and last points
    expect(query).toContain(`${points[0].lat}`);
    expect(query).toContain(`${points[499].lat}`);
  });
});

describe('buildProximityQuery', () => {
  it('generates valid Overpass QL with coords, radius, and all 6 POI types', () => {
    const query = buildProximityQuery(50.123, 20.456, 5000);

    expect(query).toContain('[out:json]');
    expect(query).toContain('[timeout:30]');
    expect(query).toContain('around:5000,50.123,20.456');
    expect(query).toContain('"amenity"="fuel"');
    expect(query).toContain('"shop"="convenience"');
    expect(query).toContain('"shop"="supermarket"');
    expect(query).toContain('"shop"="bakery"');
    expect(query).toContain('"amenity"="restaurant"');
    expect(query).toContain('"amenity"="cafe"');
    expect(query).toContain('out center body');
  });
});

describe('parseOverpassResponse', () => {
  // Slice 3: extracts POIs with all fields
  it('extracts POIs from complete response', () => {
    const response: OverpassResponse = {
      elements: [
        {
          id: 123,
          type: 'node',
          lat: 50.1,
          lon: 20.1,
          tags: {
            name: 'Shell Station',
            amenity: 'fuel',
            opening_hours: 'Mo-Su 06:00-22:00',
            'payment:credit_cards': 'yes',
          },
        },
      ],
    };

    const pois = parseOverpassResponse(response);
    expect(pois).toHaveLength(1);
    expect(pois[0]).toEqual({
      id: 123,
      name: 'Shell Station',
      type: 'fuel',
      lat: 50.1,
      lng: 20.1,
      openingHours: 'Mo-Su 06:00-22:00',
      acceptsCards: true,
    });
  });

  // Slice 4: handles missing optional fields
  it('defaults to null for missing optional fields', () => {
    const response: OverpassResponse = {
      elements: [
        {
          id: 456,
          type: 'node',
          lat: 50.2,
          lon: 20.2,
          tags: { amenity: 'cafe' },
        },
      ],
    };

    const pois = parseOverpassResponse(response);
    expect(pois[0].name).toBeNull();
    expect(pois[0].openingHours).toBeNull();
    expect(pois[0].acceptsCards).toBeNull();
  });

  // Slice 5: detects card payment from various OSM payment tags
  it('detects card payment from various payment tags', () => {
    const makeElement = (tags: Record<string, string>) => ({
      id: 1,
      type: 'node' as const,
      lat: 50,
      lon: 20,
      tags: { amenity: 'fuel', ...tags },
    });

    // credit_cards=yes
    expect(
      parseOverpassResponse({
        elements: [makeElement({ 'payment:credit_cards': 'yes' })],
      })[0].acceptsCards,
    ).toBe(true);

    // debit_cards=yes
    expect(
      parseOverpassResponse({
        elements: [makeElement({ 'payment:debit_cards': 'yes' })],
      })[0].acceptsCards,
    ).toBe(true);

    // visa=yes
    expect(
      parseOverpassResponse({
        elements: [makeElement({ 'payment:visa': 'yes' })],
      })[0].acceptsCards,
    ).toBe(true);

    // mastercard=yes
    expect(
      parseOverpassResponse({
        elements: [makeElement({ 'payment:mastercard': 'yes' })],
      })[0].acceptsCards,
    ).toBe(true);

    // credit_cards=no
    expect(
      parseOverpassResponse({
        elements: [makeElement({ 'payment:credit_cards': 'no' })],
      })[0].acceptsCards,
    ).toBe(false);

    // no payment tags
    expect(
      parseOverpassResponse({
        elements: [makeElement({})],
      })[0].acceptsCards,
    ).toBeNull();
  });

  // Handles way/relation elements with center coordinates
  it('uses center coords for ways and relations', () => {
    const response: OverpassResponse = {
      elements: [
        {
          id: 789,
          type: 'way',
          center: { lat: 50.3, lon: 20.3 },
          tags: { shop: 'supermarket', name: 'Lidl' },
        },
      ],
    };

    const pois = parseOverpassResponse(response);
    expect(pois[0].lat).toBe(50.3);
    expect(pois[0].lng).toBe(20.3);
    expect(pois[0].type).toBe('supermarket');
  });
});

describe('fetchPOIs', () => {
  // Slice 6: calls client with built query and returns parsed result
  it('calls client and returns parsed POIs', async () => {
    const mockResponse: OverpassResponse = {
      elements: [
        {
          id: 1,
          type: 'node',
          lat: 50,
          lon: 20,
          tags: { amenity: 'fuel', name: 'Test Station' },
        },
      ],
    };

    const client: OverpassClient = {
      query: vi.fn().mockResolvedValue(mockResponse),
    };

    const points = makePoints(3);
    const pois = await fetchPOIs(points, client);

    expect(client.query).toHaveBeenCalledOnce();
    const queryArg = vi.mocked(client.query).mock.calls[0][0];
    expect(queryArg).toContain('"amenity"="fuel"');

    expect(pois).toHaveLength(1);
    expect(pois[0].name).toBe('Test Station');
  });

  // Slice 7: wraps client errors in descriptive message
  it('wraps client errors with descriptive message', async () => {
    const client: OverpassClient = {
      query: vi.fn().mockRejectedValue(new Error('Network timeout')),
    };

    const points = makePoints(3);
    await expect(fetchPOIs(points, client)).rejects.toThrow(
      'Failed to fetch POIs: Network timeout',
    );
  });
});

describe('createOverpassClient retry', () => {
  const validResponse = { elements: [] };
  const noDelay = () => Promise.resolve();

  it('retries on 429 then resolves with data', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(validResponse) });
    vi.stubGlobal('fetch', mockFetch);

    const client = createOverpassClient({ delayFn: noDelay });
    const result = await client.query('test');

    expect(result).toEqual(validResponse);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
  });

  it('rejects with friendly message after max retries exceeded', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', mockFetch);

    const client = createOverpassClient({ maxRetries: 3, delayFn: noDelay });

    await expect(client.query('test')).rejects.toThrow(
      'Overpass API is busy — please try again in a minute',
    );
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

    vi.unstubAllGlobals();
  });

  it('retries on 504 then resolves with data', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(validResponse) });
    vi.stubGlobal('fetch', mockFetch);

    const client = createOverpassClient({ delayFn: noDelay });
    const result = await client.query('test');

    expect(result).toEqual(validResponse);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
  });

  it('rejects with friendly message after 5xx retries exhausted', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 504 });
    vi.stubGlobal('fetch', mockFetch);

    const client = createOverpassClient({ maxRetries: 3, delayFn: noDelay });

    await expect(client.query('test')).rejects.toThrow(
      'Server timed out — please try again',
    );
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

    vi.unstubAllGlobals();
  });

  it('rejects immediately on non-retryable errors without retry', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetch);

    const client = createOverpassClient({ delayFn: noDelay });

    await expect(client.query('test')).rejects.toThrow('Overpass API error: 500');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('calls delayFn with exponential backoff delays', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(validResponse) });
    vi.stubGlobal('fetch', mockFetch);

    const delaySpy = vi.fn(() => Promise.resolve());
    const client = createOverpassClient({ baseDelay: 1000, delayFn: delaySpy });
    await client.query('test');

    expect(delaySpy).toHaveBeenCalledTimes(3);
    expect(delaySpy).toHaveBeenNthCalledWith(1, 1000);
    expect(delaySpy).toHaveBeenNthCalledWith(2, 2000);
    expect(delaySpy).toHaveBeenNthCalledWith(3, 4000);

    vi.unstubAllGlobals();
  });
});

describe('createCachedFetcher', () => {
  it('returns cached result for same points', async () => {
    const client: OverpassClient = {
      query: vi.fn().mockResolvedValue({ elements: [
        { id: 1, type: 'node', lat: 50, lon: 20, tags: { amenity: 'fuel', name: 'Test' } },
      ] }),
    };
    const points = makePoints(3);
    const cached = createCachedFetcher(client);

    const first = await cached.fetch(points);
    const second = await cached.fetch(points);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('re-fetches after TTL expires', async () => {
    vi.useFakeTimers();
    const client: OverpassClient = {
      query: vi.fn().mockResolvedValue({ elements: [] }),
    };
    const points = makePoints(3);
    const cached = createCachedFetcher(client, 5 * 60 * 1000); // 5 min TTL

    await cached.fetch(points);
    vi.advanceTimersByTime(6 * 60 * 1000); // advance 6 min
    await cached.fetch(points);

    expect(client.query).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('fetches separately for different points', async () => {
    const client: OverpassClient = {
      query: vi.fn().mockResolvedValue({ elements: [] }),
    };
    const cached = createCachedFetcher(client);

    await cached.fetch(makePoints(3));
    await cached.fetch(makePoints(5));

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('clears cache so next call hits API again', async () => {
    const client: OverpassClient = {
      query: vi.fn().mockResolvedValue({ elements: [] }),
    };
    const points = makePoints(3);
    const cached = createCachedFetcher(client);

    await cached.fetch(points);
    cached.clear();
    await cached.fetch(points);

    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
