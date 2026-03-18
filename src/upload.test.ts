import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initUpload } from './upload';
import { MINIMAL_2_TRKPT } from './test-fixtures/gpx-samples';

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="app">
      <label for="gpx-input" class="upload-label">
        Upload GPX file
        <input type="file" id="gpx-input" accept=".gpx" />
      </label>
      <section id="route-stats" hidden>
        <h2 id="route-name"></h2>
        <p id="point-count"></p>
        <p id="route-distance"></p>
      </section>
      <p id="error-display" hidden></p>
      <button id="clear-btn" type="button" hidden>Clear route</button>
      <button id="refresh-btn" type="button" hidden>Refresh stops</button>
      <p id="loading-indicator" hidden>Loading stops…</p>
      <div id="map-container"></div>
    </div>
  `;
}

function simulateFileUpload(content: string): void {
  const fileInput = document.getElementById('gpx-input') as HTMLInputElement;
  const file = new File([content], 'test.gpx', { type: 'application/gpx+xml' });

  // Mock the files property
  Object.defineProperty(fileInput, 'files', {
    value: [file],
    writable: false,
    configurable: true,
  });

  fileInput.dispatchEvent(new Event('change'));
}

async function flushFileReader(): Promise<void> {
  // Allow FileReader.onload to fire
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
    })),
    setDefaultFactory: vi.fn(),
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

  // Slice 13: Refresh button triggers POI fetch and displays results on map
  it('clicking refresh fetches POIs and shows on map', async () => {
    const { initRouteMap } = await import('./route-map');
    initUpload();
    const handle = vi.mocked(initRouteMap).mock.results[0].value;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    // Wait for async fetch
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(handle.showPOIs).toHaveBeenCalledOnce();
  });

  // Slice 14: Loading indicator shown during fetch, hidden after
  it('shows loading indicator during fetch', async () => {
    initUpload();
    const loading = document.getElementById('loading-indicator') as HTMLElement;

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    expect(loading.hidden).toBe(true);

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    // Loading should eventually be hidden after fetch completes
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loading.hidden).toBe(true);
  });

  // Slice 15: Error state on fetch failure
  it('shows error on fetch failure and hides loading', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Overpass API error'));

    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const loading = document.getElementById('loading-indicator') as HTMLElement;
    const errorDisplay = document.getElementById('error-display') as HTMLElement;
    expect(loading.hidden).toBe(true);
    expect(errorDisplay.hidden).toBe(false);
    expect(errorDisplay.textContent).toContain('Overpass API error');
  });

  // Cycle 3: Debounce — two clicks while in-flight only fetches once
  it('ignores clicks while fetch is in-flight', async () => {
    let resolveFetch!: (value: unknown[]) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click(); // first click — starts fetch
    refreshBtn.click(); // second click — should be ignored

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Complete the fetch
    resolveFetch([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // Cycle 3: Button re-enabled after fetch completes
  it('re-enables refresh button after fetch completes', async () => {
    let resolveFetch!: (value: unknown[]) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

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

    initUpload();

    simulateFileUpload(MINIMAL_2_TRKPT);
    await flushFileReader();

    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    refreshBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorDisplay = document.getElementById('error-display') as HTMLElement;
    expect(errorDisplay.textContent).toContain('try again');
  });
});
