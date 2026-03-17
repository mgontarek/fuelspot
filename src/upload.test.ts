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
  return {
    initRouteMap: vi.fn(() => ({
      showRoute,
      clear,
      destroy,
      showRiderPosition,
      clearRiderPosition,
      showOffRouteWarning,
      hideOffRouteWarning,
    })),
    setDefaultFactory: vi.fn(),
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
