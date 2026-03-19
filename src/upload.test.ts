import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initUpload } from './upload';
import { MINIMAL_2_TRKPT } from './test-fixtures/gpx-samples';
import { createI18n } from './i18n';

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="app">
      <button id="lang-toggle" type="button" class="lang-toggle">PL</button>
      <h1 data-i18n="app.title">FuelSpot</h1>
      <p class="subtitle" data-i18n="app.subtitle">Find open resupply stops along your route</p>
      <label for="gpx-input" class="upload-label">
        <span data-i18n="upload.label">Upload GPX file</span>
        <input type="file" id="gpx-input" accept=".gpx" />
      </label>
      <section id="route-stats" hidden>
        <h2 id="route-name"></h2>
        <p id="point-count"></p>
        <p id="route-distance"></p>
      </section>
      <p id="warning-display" hidden></p>
      <p id="error-display" hidden></p>
      <div class="action-buttons">
        <button id="clear-btn" type="button" hidden data-i18n="upload.clear">Clear route</button>
        <button id="refresh-btn" type="button" hidden data-i18n="upload.refresh">Refresh stops</button>
      </div>
      <p id="loading-indicator" hidden data-i18n="upload.loading">Loading stops…</p>
      <div id="result-card-container"></div>
      <div id="map-container"></div>
    </div>
  `;
}

function simulateFileUpload(content: string): void {
  const fileInput = document.getElementById('gpx-input') as HTMLInputElement;
  const file = new File([content], 'test.gpx', { type: 'application/gpx+xml' });

  Object.defineProperty(fileInput, 'files', {
    value: [file],
    writable: false,
    configurable: true,
  });

  fileInput.dispatchEvent(new Event('change'));
}

async function flushFileReader(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Mock route-map module
vi.mock('./route-map', () => {
  const showRoute = vi.fn();
  const clear = vi.fn();
  const destroy = vi.fn();
  const showRiderPosition = vi.fn();
  const clearRiderPosition = vi.fn();
  const showOffRouteWarning = vi.fn();
  const hideOffRouteWarning = vi.fn();
  const showPOIs = vi.fn();
  const clearPOIs = vi.fn();
  const highlightStop = vi.fn();
  const clearHighlight = vi.fn();
  const zoomToFit = vi.fn();
  return {
    initRouteMap: vi.fn(() => ({
      showRoute,
      clear,
      destroy,
      showRiderPosition,
      clearRiderPosition,
      showOffRouteWarning,
      hideOffRouteWarning,
      showPOIs,
      clearPOIs,
      highlightStop,
      clearHighlight,
      zoomToFit,
    })),
    setDefaultFactory: vi.fn(),
  };
});

// Mock result-card module
const mockResultCard = {
  showStop: vi.fn(),
  showLoading: vi.fn(),
  showError: vi.fn(),
  showEmpty: vi.fn(),
  showWaitingForGps: vi.fn(),
  clear: vi.fn(),
};
vi.mock('./result-card', () => {
  return {
    initResultCard: vi.fn(() => mockResultCard),
  };
});

// Mock poi-fetcher module
const mockFetch = vi.fn().mockResolvedValue([
  { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
]);
vi.mock('./poi-fetcher', () => {
  return {
    fetchPOIs: vi.fn().mockResolvedValue([
      { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    ]),
    createOverpassClient: vi.fn(() => ({ query: vi.fn() })),
    createCachedFetcher: vi.fn(() => ({
      fetch: mockFetch,
      clear: vi.fn(),
    })),
  };
});

// Mock stop-ranker module
const mockRankStops = vi.fn().mockReturnValue([
  {
    poi: { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    hours: { status: 'open', nextChange: null, displayString: 'Open 24/7' },
    distanceAlongRoute: 1500,
    straightLineDistance: 1200,
    countdown: null,
  },
]);
vi.mock('./stop-ranker', () => {
  return {
    rankStops: (...args: unknown[]) => mockRankStops(...args),
  };
});

// Mock hours-evaluator module
vi.mock('./hours-evaluator', () => {
  return {
    evaluateHours: vi.fn().mockReturnValue({ status: 'unknown', nextChange: null, displayString: 'Hours unknown' }),
    createOpeningHoursParser: vi.fn(() => ({
      evaluate: vi.fn().mockReturnValue({ isOpen: false, isUnknown: true, nextChange: null }),
    })),
    formatCountdown: vi.fn().mockReturnValue('1h 30m'),
  };
});

describe('upload integration with map', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.clearAllMocks();
  });

  // Cycle 12: upload.ts creates map on init
  it('initializes map on #map-container', async () => {
    const { initRouteMap } = await import('./route-map');
    initUpload();

    expect(initRouteMap).toHaveBeenCalledOnce();
    const call = vi.mocked(initRouteMap).mock.calls[0];
    expect(call[0]).toBe(document.getElementById('map-container'));
  });

  // Cycle 13: File upload shows route on map
  it('calls showRoute on map after file upload', async () => {
    const { initRouteMap } = await import('./route-map');
    initUpload();
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(handle.showRoute).toHaveBeenCalledOnce();
    expect(handle.showRoute).toHaveBeenCalledWith(
      expect.objectContaining({ points: expect.any(Array) }),
    );
  });

  // Cycle 14: Clear button clears map
  it('calls clear on map when clear button clicked', async () => {
    const { initRouteMap } = await import('./route-map');
    initUpload();
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    clearBtn.click();

    expect(handle.clear).toHaveBeenCalledOnce();
  });

  // Cycle 15: localStorage route shown on map at init
  it('shows route from localStorage on init', async () => {
    localStorage.setItem('fuelspot-gpx', MINIMAL_2_TRKPT);
    const { initRouteMap } = await import('./route-map');
    initUpload();
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    expect(handle.showRoute).toHaveBeenCalledOnce();
  });
});

function createMockGeo() {
  let successCb: PositionCallback | null = null;
  let errorCb: PositionErrorCallback | null = null;
  let nextId = 1;

  const geo = {
    watchPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
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
    errorCb!({ code, message: 'test' } as GeolocationPositionError);
  }

  return { geo, simulatePosition, simulateError };
}

describe('upload GPS integration', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.clearAllMocks();
  });

  // Slice 23: When route is displayed, GPS tracker starts
  it('starts GPS tracker when route is shown', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(mockGeo.geo.watchPosition).toHaveBeenCalledOnce();
  });

  // Slice 24: GPS onChange with position -> showRiderPosition
  it('shows rider position on GPS update', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    expect(handle.showRiderPosition).toHaveBeenCalledWith({ lat: 50, lng: 20 });
  });

  // Slice 25: onChange with isOnRoute: false -> showOffRouteWarning
  it('shows off-route warning when position is far from route', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    // Position far from route
    mockGeo.simulatePosition(60, 30);

    expect(handle.showOffRouteWarning).toHaveBeenCalled();
  });

  // Slice 26: onChange with isOnRoute: true after off-route -> hideOffRouteWarning
  it('hides off-route warning when back on route', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    // First: off-route
    mockGeo.simulatePosition(60, 30);
    // Then: on-route (the fixture has points at lat 50, lng 20)
    mockGeo.simulatePosition(50, 20);

    expect(handle.hideOffRouteWarning).toHaveBeenCalled();
  });

  // Slice 27: GPS error: denied -> no crash, no marker
  it('handles GPS permission denied without crashing', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(() => mockGeo.simulateError(1)).not.toThrow();
    expect(handle.showRiderPosition).not.toHaveBeenCalled();
  });

  // Slice 28: Clear route -> gpsTracker.stop()
  it('stops GPS tracker when route is cleared', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    clearBtn.click();

    expect(mockGeo.geo.clearWatch).toHaveBeenCalled();
  });

  // Slice 29: No geolocation -> app works normally
  it('works without geolocation provider', async () => {
    const { initRouteMap } = await import('./route-map');
    initUpload(); // no geo provider
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(handle.showRoute).toHaveBeenCalledOnce();
  });
});

describe('upload refresh button', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.clearAllMocks();
  });

  // Slice 12: Refresh button visible when route is loaded, hidden when cleared
  it('shows refresh button when route loaded, hides on clear', async () => {
    initUpload();
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;

    expect(refreshBtn.hidden).toBe(true);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(refreshBtn.hidden).toBe(false);

    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    clearBtn.click();

    expect(refreshBtn.hidden).toBe(true);
  });

  // Slice 13: Refresh button triggers search pipeline when GPS available
  it('clicking refresh with GPS runs search pipeline', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    // Give GPS position first
    mockGeo.simulatePosition(50, 20);
    // Wait for auto-search to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Reset mocks after auto-search
    vi.clearAllMocks();
    mockFetch.mockResolvedValue([
      { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    ]);
    mockRankStops.mockReturnValue([
      {
        poi: { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
        hours: { status: 'open', nextChange: null, displayString: 'Open 24/7' },
        distanceAlongRoute: 1500,
        straightLineDistance: 1200,
        countdown: null,
      },
    ]);

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockRankStops).toHaveBeenCalledOnce();
    expect(mockResultCard.showStop).toHaveBeenCalledOnce();
    expect(handle.highlightStop).toHaveBeenCalledOnce();
    expect(handle.showPOIs).toHaveBeenCalledOnce();
  });

  // Slice 14: Loading indicator shown during fetch, hidden after
  it('shows loading indicator during fetch', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();
    mockGeo.simulatePosition(50, 20);

    // Wait for auto-search to finish
    await new Promise((resolve) => setTimeout(resolve, 0));

    const loading = document.getElementById('loading-indicator') as HTMLElement;
    expect(loading.hidden).toBe(true);
  });

  // Slice 15: Error state on fetch failure
  it('shows error on fetch failure and hides loading', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Overpass API error'));

    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const loading = document.getElementById('loading-indicator') as HTMLElement;
    expect(loading.hidden).toBe(true);
    expect(mockResultCard.showError).toHaveBeenCalled();
  });

  // Cycle 3: Debounce — two clicks while in-flight only fetches once
  it('ignores clicks while fetch is in-flight', async () => {
    let resolveFetch!: (value: unknown[]) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    // auto-search is in flight, click refresh
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    // Should still be just 1 fetch (auto-search)
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFetch([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // Cycle 3: Button re-enabled after fetch completes
  it('re-enables refresh button after fetch completes', async () => {
    let resolveFetch!: (value: unknown[]) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    // auto-search in flight — button should be disabled
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);

    resolveFetch([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(refreshBtn.disabled).toBe(false);
  });

  // Cycle 4: Friendly error message displayed in UI
  it('shows friendly error from retry exhaustion', async () => {
    mockFetch.mockRejectedValueOnce(
      new Error('Failed to fetch POIs: Overpass API is busy — please try again in a minute'),
    );

    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockResultCard.showError).toHaveBeenCalledWith(
      expect.stringContaining('try again'),
    );
  });
});

describe('upload auto-search pipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue([
      { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    ]);
    mockRankStops.mockReturnValue([
      {
        poi: { id: 1, name: 'Test POI', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
        hours: { status: 'open', nextChange: null, displayString: 'Open 24/7' },
        distanceAlongRoute: 1500,
        straightLineDistance: 1200,
        countdown: null,
      },
    ]);
  });

  // Slice 18: Result card initialized on init
  it('initializes result card on init', async () => {
    const { initResultCard } = await import('./result-card');
    initUpload();

    expect(initResultCard).toHaveBeenCalledOnce();
  });

  // Slice 19: Route loaded without GPS shows "waiting for GPS"
  it('shows waiting for GPS when route loaded without GPS position', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(mockResultCard.showWaitingForGps).toHaveBeenCalled();
  });

  // Slice 20: Auto-search fires on first GPS position
  it('auto-search fires on first GPS position after route load', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockRankStops).toHaveBeenCalledOnce();
    expect(mockResultCard.showStop).toHaveBeenCalledOnce();
    expect(handle.highlightStop).toHaveBeenCalledOnce();
  });

  // Slice 21: Auto-search doesn't re-trigger on subsequent GPS updates
  it('auto-search fires only once', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    mockGeo.simulatePosition(50.001, 20.001);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // Slice 22: GPS denied shows error on result card
  it('GPS denied shows error on result card', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulateError(1);

    expect(mockResultCard.showError).toHaveBeenCalledWith(
      expect.stringContaining('GPS'),
    );
  });

  // Slice 23: Refresh without GPS shows GPS warning
  it('refresh without GPS shows GPS warning on result card', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    expect(mockResultCard.showError).toHaveBeenCalledWith(
      expect.stringContaining('GPS'),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Slice 25: Pipeline shows loading on card
  it('pipeline shows loading on card before fetch', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);

    expect(mockResultCard.showLoading).toHaveBeenCalled();
  });

  // Slice 26: Empty ranking shows "no stops"
  it('empty ranking shows no stops on card', async () => {
    mockRankStops.mockReturnValue([]);

    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockResultCard.showEmpty).toHaveBeenCalled();
  });

  // Slice 27: Fetch error shows error on card
  it('fetch error shows error on card', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockResultCard.showError).toHaveBeenCalledWith(
      expect.stringContaining('Network error'),
    );
  });

  // Slice 28: Pipeline highlights #1 on map
  it('pipeline highlights #1 stop on map', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handle.highlightStop).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'Test POI' }),
    );
  });

  // Slice 29: Pipeline zooms map to rider + #1 stop
  it('pipeline zooms map to rider and #1 stop', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handle.zoomToFit).toHaveBeenCalledWith([
      { lat: 50, lng: 20 },
      { lat: 50, lng: 20 },
    ]);
  });

  // Slice 30: Clear resets card and highlight
  it('clear resets result card and map highlight', async () => {
    const { initRouteMap } = await import('./route-map');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    clearBtn.click();

    expect(mockResultCard.clear).toHaveBeenCalled();
    expect(handle.clearHighlight).toHaveBeenCalled();
  });

  // Slice 31: New file upload resets auto-search flag
  it('new file upload resets auto-search flag', async () => {
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Upload new file
    vi.clearAllMocks();
    mockFetch.mockResolvedValue([
      { id: 2, name: 'New POI', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
    ]);
    mockRankStops.mockReturnValue([
      {
        poi: { id: 2, name: 'New POI', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
        hours: { status: 'open', nextChange: null, displayString: 'Open 24/7' },
        distanceAlongRoute: 2000,
        straightLineDistance: 1500,
        countdown: null,
      },
    ]);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    // GPS arrives again — should trigger auto-search again
    mockGeo.simulatePosition(50, 20);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('upload i18n integration', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.clearAllMocks();
  });

  // Slice 23: initUpload populates data-i18n elements
  it('initUpload with i18n populates data-i18n elements', () => {
    const i18n = createI18n('pl');
    initUpload(undefined, undefined, i18n);

    const subtitle = document.querySelector('[data-i18n="app.subtitle"]') as HTMLElement;
    expect(subtitle.textContent).toBe('Znajdź otwarte sklepy na trasie');

    const uploadLabel = document.querySelector('[data-i18n="upload.label"]') as HTMLElement;
    expect(uploadLabel.textContent).toBe('Wgraj plik GPX');
  });

  // Slice 24: Route stats use translated text
  it('route stats use translated text', async () => {
    const i18n = createI18n('pl');
    initUpload(undefined, undefined, i18n);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const pointCountEl = document.getElementById('point-count') as HTMLElement;
    expect(pointCountEl.textContent).toContain('punktów');

    const routeNameEl = document.getElementById('route-name') as HTMLElement;
    // The fixture has no name, so it should show the Polish unnamed
    expect(routeNameEl.textContent).toBeTruthy();
  });

  // Slice 25: GPS error messages use translated text
  it('GPS denied shows Polish error', async () => {
    const i18n = createI18n('pl');
    const mockGeo = createMockGeo();
    initUpload(mockGeo.geo, undefined, i18n);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    mockGeo.simulateError(1);

    expect(mockResultCard.showError).toHaveBeenCalledWith(
      expect.stringContaining('GPS'),
    );
  });

  // Slice 26: i18n.onChange triggers re-render of static text
  it('locale change re-renders static text', async () => {
    const i18n = createI18n('en');
    initUpload(undefined, undefined, i18n);

    const subtitle = document.querySelector('[data-i18n="app.subtitle"]') as HTMLElement;
    expect(subtitle.textContent).toBe('Find open resupply stops along your route');

    i18n.setLocale('pl');
    expect(subtitle.textContent).toBe('Znajdź otwarte sklepy na trasie');
  });
});

describe('upload localStorage quota handling', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.clearAllMocks();
  });

  function stubSetItemQuotaError(): void {
    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'fuelspot-gpx') {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      return original(key, value);
    });
  }

  // Cycle 1: Route displays despite quota error
  it('displays route when localStorage.setItem throws QuotaExceededError', async () => {
    stubSetItemQuotaError();
    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const stats = document.getElementById('route-stats') as HTMLElement;
    const error = document.getElementById('error-display') as HTMLElement;
    expect(stats.hidden).toBe(false);
    expect(error.hidden).toBe(true);
  });

  // Cycle 2: Non-blocking warning shown
  it('shows warning when localStorage.setItem throws QuotaExceededError', async () => {
    stubSetItemQuotaError();
    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const warning = document.getElementById('warning-display') as HTMLElement;
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toBeTruthy();
  });

  // Cycle 3: Clear frees storage, re-upload succeeds without warning
  it('clear hides warning, re-upload without quota error shows no warning', async () => {
    stubSetItemQuotaError();
    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const warning = document.getElementById('warning-display') as HTMLElement;
    expect(warning.hidden).toBe(false);

    // Click clear
    const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    clearBtn.click();
    expect(warning.hidden).toBe(true);

    // Restore setItem
    vi.restoreAllMocks();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(warning.hidden).toBe(true);
  });

  // Cycle 4: i18n integration — Polish warning text
  it('shows Polish warning text when locale is pl', async () => {
    stubSetItemQuotaError();
    const i18n = createI18n('pl');
    initUpload(undefined, undefined, i18n);

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const warning = document.getElementById('warning-display') as HTMLElement;
    expect(warning.textContent).toContain('za duży');
  });
});
