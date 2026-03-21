import type { RoutePoint } from './gpx-parser';

export type POIType =
  | 'fuel'
  | 'convenience'
  | 'supermarket'
  | 'bakery'
  | 'restaurant'
  | 'cafe';

export interface POI {
  id: number;
  name: string | null;
  type: POIType;
  lat: number;
  lng: number;
  openingHours: string | null;
  acceptsCards: boolean | null;
}

export interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

export interface OverpassClient {
  query(overpassQL: string): Promise<OverpassResponse>;
}

const POI_FILTERS = [
  ['amenity', 'fuel'],
  ['shop', 'convenience'],
  ['shop', 'supermarket'],
  ['shop', 'bakery'],
  ['amenity', 'restaurant'],
  ['amenity', 'cafe'],
] as const;

const MAX_SAMPLE_POINTS = 50;

export function buildOverpassQuery(points: RoutePoint[]): string {
  const sampled = samplePoints(points);
  const coords = sampled.map((p) => `${p.lat},${p.lng}`).join(',');

  const filters = POI_FILTERS.map(
    ([key, value]) => `  nwr["${key}"="${value}"](around:300,${coords});`,
  ).join('\n');

  return `[out:json][timeout:30];
(
${filters}
);
out center body;`;
}

export function buildProximityQuery(lat: number, lng: number, radiusMeters: number): string {
  const filters = POI_FILTERS.map(
    ([key, value]) => `  nwr["${key}"="${value}"](around:${radiusMeters},${lat},${lng});`,
  ).join('\n');

  return `[out:json][timeout:30];
(
${filters}
);
out center body;`;
}

function samplePoints(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= MAX_SAMPLE_POINTS) return points;

  const step = (points.length - 1) / (MAX_SAMPLE_POINTS - 1);
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < MAX_SAMPLE_POINTS; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

const TAG_TO_TYPE: Record<string, POIType> = {
  fuel: 'fuel',
  convenience: 'convenience',
  supermarket: 'supermarket',
  bakery: 'bakery',
  restaurant: 'restaurant',
  cafe: 'cafe',
};

const CARD_TAGS = [
  'payment:credit_cards',
  'payment:debit_cards',
  'payment:visa',
  'payment:mastercard',
];

export function parseOverpassResponse(response: OverpassResponse): POI[] {
  return response.elements.map((el) => {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat ?? 0;
    const lng = el.lon ?? el.center?.lon ?? 0;

    return {
      id: el.id,
      name: tags.name ?? null,
      type: resolveType(tags),
      lat,
      lng,
      openingHours: tags.opening_hours ?? null,
      acceptsCards: resolveCards(tags),
    };
  });
}

function resolveType(tags: Record<string, string>): POIType {
  const amenity = tags.amenity;
  const shop = tags.shop;
  if (amenity && TAG_TO_TYPE[amenity]) return TAG_TO_TYPE[amenity];
  if (shop && TAG_TO_TYPE[shop]) return TAG_TO_TYPE[shop];
  return 'fuel'; // fallback
}

function resolveCards(tags: Record<string, string>): boolean | null {
  for (const key of CARD_TAGS) {
    if (key in tags) {
      return tags[key] === 'yes';
    }
  }
  return null;
}

export interface OverpassClientOptions {
  maxRetries?: number;
  baseDelay?: number;
  delayFn?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RETRYABLE_STATUSES = [429, 502, 503, 504];
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.includes(status);
}

export function createOverpassClient(options?: OverpassClientOptions): OverpassClient {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const delayFn = options?.delayFn ?? defaultDelay;

  return {
    async query(overpassQL: string) {
      let retries = 0;
      while (true) {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: `data=${encodeURIComponent(overpassQL)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (res.ok) return res.json();
        if (!isRetryableStatus(res.status) || retries >= maxRetries) {
          if (res.status === 429) {
            throw new Error('Overpass API is busy — please try again in a minute');
          }
          if (res.status >= 502 && res.status <= 504) {
            throw new Error('Server timed out — please try again');
          }
          throw new Error(`Overpass API error: ${res.status}`);
        }
        await delayFn(baseDelay * 2 ** retries);
        retries++;
      }
    },
  };
}

export interface CachedFetcher {
  fetch(points: RoutePoint[]): Promise<POI[]>;
  clear(): void;
}

export function createCachedFetcher(
  client: OverpassClient,
  ttl: number = 5 * 60 * 1000,
): CachedFetcher {
  const cache = new Map<string, { pois: POI[]; timestamp: number }>();

  return {
    async fetch(points: RoutePoint[]): Promise<POI[]> {
      const query = buildOverpassQuery(points);
      const entry = cache.get(query);
      if (entry && Date.now() - entry.timestamp < ttl) {
        return entry.pois;
      }
      const response = await client.query(query);
      const pois = parseOverpassResponse(response);
      cache.set(query, { pois, timestamp: Date.now() });
      return pois;
    },
    clear() {
      cache.clear();
    },
  };
}

export async function fetchPOIs(
  points: RoutePoint[],
  client: OverpassClient,
): Promise<POI[]> {
  const query = buildOverpassQuery(points);
  try {
    const response = await client.query(query);
    return parseOverpassResponse(response);
  } catch (err) {
    throw new Error(
      `Failed to fetch POIs: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
