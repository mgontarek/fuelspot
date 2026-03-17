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
  return {
    initRouteMap: vi.fn(() => ({ showRoute, clear, destroy })),
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
