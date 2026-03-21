import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeafletFactory, RouteMapHandle } from './route-map';
import { initRouteMap } from './route-map';
import type { ParsedRoute } from './gpx-parser';
import type { POI } from './poi-fetcher';
import { createI18n } from './i18n';

function makeRoute(
  points: Array<{ lat: number; lng: number }>,
  name: string | null = 'Test',
): ParsedRoute {
  let cumulative = 0;
  return {
    name,
    totalDistance: 0,
    points: points.map((p, i) => {
      if (i > 0) cumulative += 1000;
      return { lat: p.lat, lng: p.lng, cumulativeDistance: cumulative };
    }),
  };
}

function createMockFactory() {
  const mockMap = {
    fitBounds: vi.fn(),
    setView: vi.fn(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
  };
  const mockTileLayer = { addTo: vi.fn().mockReturnThis() };

  const polylines: Array<{ addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; getBounds: ReturnType<typeof vi.fn> }> = [];
  const markers: Array<{ addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }> = [];
  const circleMarkers: Array<{ addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; setLatLng: ReturnType<typeof vi.fn>; bindPopup: ReturnType<typeof vi.fn> }> = [];

  const factory: LeafletFactory = {
    map: vi.fn(() => mockMap) as unknown as LeafletFactory['map'],
    tileLayer: vi.fn(
      () => mockTileLayer,
    ) as unknown as LeafletFactory['tileLayer'],
    polyline: vi.fn(() => {
      const p = {
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getBounds: vi.fn(() => 'mockBounds'),
      };
      polylines.push(p);
      return p;
    }) as unknown as LeafletFactory['polyline'],
    marker: vi.fn(() => {
      const m = { addTo: vi.fn().mockReturnThis(), remove: vi.fn() };
      markers.push(m);
      return m;
    }) as unknown as LeafletFactory['marker'],
    circleMarker: vi.fn(() => {
      const cm = {
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        setLatLng: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
      };
      circleMarkers.push(cm);
      return cm;
    }) as unknown as LeafletFactory['circleMarker'],
  };

  return { factory, mockMap, mockTileLayer, polylines, markers, circleMarkers };
}

describe('route-map', () => {
  let container: HTMLElement;
  let mocks: ReturnType<typeof createMockFactory>;
  let handle: RouteMapHandle;

  beforeEach(() => {
    container = document.createElement('div');
    mocks = createMockFactory();
    handle = initRouteMap(container, mocks.factory);
  });

  // Cycle 1: Module shape
  it('returns an object with showRoute, clear, destroy', () => {
    expect(typeof handle.showRoute).toBe('function');
    expect(typeof handle.clear).toBe('function');
    expect(typeof handle.destroy).toBe('function');
  });

  // Cycle 2: Map initialization
  it('calls factory.map once on init', () => {
    expect(mocks.factory.map).toHaveBeenCalledOnce();
    const call = vi.mocked(mocks.factory.map).mock.calls[0];
    expect(call[0]).toBeInstanceOf(HTMLElement);
    expect(call[1]).toMatchObject({ center: [0, 0], zoom: 2 });
  });

  // Cycle 3: Tile layer
  it('creates tile layer with OSM URL and adds to map', () => {
    expect(mocks.factory.tileLayer).toHaveBeenCalledOnce();
    const call = vi.mocked(mocks.factory.tileLayer).mock.calls[0];
    expect(call[0]).toContain('openstreetmap.org');
    expect(mocks.mockTileLayer.addTo).toHaveBeenCalledWith(mocks.mockMap);
  });

  // Cycle 4: Polyline from route points
  it('creates polyline from route points and adds to map', () => {
    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 50.1, lng: 20.1 },
      { lat: 50.2, lng: 20.2 },
    ]);
    handle.showRoute(route);

    expect(mocks.factory.polyline).toHaveBeenCalledOnce();
    const call = vi.mocked(mocks.factory.polyline).mock.calls[0];
    expect(call[0]).toEqual([
      [50, 20],
      [50.1, 20.1],
      [50.2, 20.2],
    ]);
    expect(mocks.polylines[0].addTo).toHaveBeenCalledWith(mocks.mockMap);
  });

  // Cycle 5: Start and finish markers
  it('creates start and finish markers with titles', () => {
    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);
    handle.showRoute(route);

    expect(mocks.factory.marker).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(mocks.factory.marker).mock.calls;
    expect(calls[0][0]).toEqual([50, 20]);
    expect(calls[0][1]).toMatchObject({ title: 'Start' });
    expect(calls[1][0]).toEqual([51, 21]);
    expect(calls[1][1]).toMatchObject({ title: 'Finish' });
    expect(mocks.markers).toHaveLength(2);
    expect(mocks.markers[0].addTo).toHaveBeenCalledWith(mocks.mockMap);
    expect(mocks.markers[1].addTo).toHaveBeenCalledWith(mocks.mockMap);
  });

  // Cycle 6: Auto-zoom to fit route
  it('calls fitBounds after showRoute', () => {
    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);
    handle.showRoute(route);

    expect(mocks.mockMap.fitBounds).toHaveBeenCalledWith('mockBounds', {
      padding: [20, 20],
    });
  });

  // Cycle 7: Re-showing clears previous layers
  it('removes previous layers when showRoute called again', () => {
    const route1 = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);
    handle.showRoute(route1);
    expect(mocks.polylines[0].remove).not.toHaveBeenCalled();
    expect(mocks.markers[0].remove).not.toHaveBeenCalled();
    expect(mocks.markers[1].remove).not.toHaveBeenCalled();

    const route2 = makeRoute([
      { lat: 52, lng: 22 },
      { lat: 53, lng: 23 },
    ]);
    handle.showRoute(route2);
    expect(mocks.polylines[0].remove).toHaveBeenCalledOnce();
    expect(mocks.markers[0].remove).toHaveBeenCalledOnce();
    expect(mocks.markers[1].remove).toHaveBeenCalledOnce();
  });

  // Cycle 8: clear() removes layers and resets view
  it('clear removes layers and resets view', () => {
    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);
    handle.showRoute(route);
    handle.clear();

    expect(mocks.polylines[0].remove).toHaveBeenCalled();
    expect(mocks.markers[0].remove).toHaveBeenCalled();
    expect(mocks.markers[1].remove).toHaveBeenCalled();
    expect(mocks.mockMap.setView).toHaveBeenCalledWith([0, 0], 2);
  });

  // Cycle 9: destroy() removes the map
  it('destroy calls map.remove', () => {
    handle.destroy();
    expect(mocks.mockMap.remove).toHaveBeenCalledOnce();
  });

  // Cycle 10: Single-point route edge case
  it('handles single-point route with one marker and no polyline', () => {
    const route = makeRoute([{ lat: 50, lng: 20 }]);
    handle.showRoute(route);

    expect(mocks.factory.polyline).not.toHaveBeenCalled();
    expect(mocks.factory.marker).toHaveBeenCalledOnce();
    expect(mocks.mockMap.setView).toHaveBeenCalledWith([50, 20], 14);
  });

  // Cycle 12: invalidateSize is called when route is shown
  it('calls invalidateSize after showRoute', () => {
    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      }),
    );

    handle.showRoute(route);

    expect(mocks.mockMap.invalidateSize).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  // Cycle 13: invalidateSize is deferred via requestAnimationFrame
  it('defers invalidateSize via requestAnimationFrame', () => {
    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);

    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        rafCallback = cb;
        return 0;
      }),
    );

    handle.showRoute(route);

    // Not called synchronously
    expect(mocks.mockMap.invalidateSize).not.toHaveBeenCalled();

    // Called after rAF fires
    rafCallback!(0);
    expect(mocks.mockMap.invalidateSize).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  // Cycle 11: Placeholder when no route
  it('shows placeholder initially, hides after showRoute, shows after clear', () => {
    const placeholder = container.querySelector('.map-placeholder') as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(placeholder.hidden).toBe(false);
    expect(placeholder.textContent).toContain('Upload a GPX file');

    const route = makeRoute([
      { lat: 50, lng: 20 },
      { lat: 51, lng: 21 },
    ]);
    handle.showRoute(route);
    expect(placeholder.hidden).toBe(true);

    handle.clear();
    expect(placeholder.hidden).toBe(false);
  });

  // Cycle 17: showRiderPosition creates circleMarker on map
  it('showRiderPosition creates circleMarker on map', () => {
    handle.showRiderPosition({ lat: 50.5, lng: 20.5 });

    expect(mocks.factory.circleMarker).toHaveBeenCalledOnce();
    const call = vi.mocked(mocks.factory.circleMarker).mock.calls[0];
    expect(call[0]).toEqual([50.5, 20.5]);
    expect(mocks.circleMarkers[0].addTo).toHaveBeenCalledWith(mocks.mockMap);
  });

  // Cycle 18: Subsequent showRiderPosition calls setLatLng
  it('subsequent showRiderPosition calls setLatLng instead of creating new marker', () => {
    handle.showRiderPosition({ lat: 50.5, lng: 20.5 });
    handle.showRiderPosition({ lat: 50.6, lng: 20.6 });

    expect(mocks.factory.circleMarker).toHaveBeenCalledOnce();
    expect(mocks.circleMarkers[0].setLatLng).toHaveBeenCalledWith([50.6, 20.6]);
  });

  // Cycle 19: clearRiderPosition removes marker
  it('clearRiderPosition removes the rider marker', () => {
    handle.showRiderPosition({ lat: 50.5, lng: 20.5 });
    handle.clearRiderPosition();

    expect(mocks.circleMarkers[0].remove).toHaveBeenCalledOnce();
  });

  // Cycle 20: showOffRouteWarning shows banner with distance
  it('showOffRouteWarning shows the off-route banner with distance in km', () => {
    const banner = container.querySelector('.off-route-warning') as HTMLElement;
    expect(banner.hidden).toBe(true);

    handle.showOffRouteWarning(1500);
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('You are off route — 1.5 km away');
  });

  it('showOffRouteWarning shows distance in meters when under 1km', () => {
    handle.showOffRouteWarning(800);
    const banner = container.querySelector('.off-route-warning') as HTMLElement;
    expect(banner.textContent).toBe('You are off route — 800 m away');
  });

  it('showOffRouteWarning updates text dynamically', () => {
    const banner = container.querySelector('.off-route-warning') as HTMLElement;
    handle.showOffRouteWarning(800);
    expect(banner.textContent).toBe('You are off route — 800 m away');

    handle.showOffRouteWarning(1500);
    expect(banner.textContent).toBe('You are off route — 1.5 km away');
  });

  // Cycle 21: hideOffRouteWarning hides banner
  it('hideOffRouteWarning hides the off-route banner', () => {
    handle.showOffRouteWarning(500);
    handle.hideOffRouteWarning();

    const banner = container.querySelector('.off-route-warning') as HTMLElement;
    expect(banner.hidden).toBe(true);
  });

  // Slice 8: showPOIs adds circle markers with category-specific colors
  it('showPOIs adds circle markers for each POI with correct colors', () => {
    const pois: POI[] = [
      { id: 1, name: 'Shell', type: 'fuel', lat: 50.1, lng: 20.1, openingHours: null, acceptsCards: true },
      { id: 2, name: 'Cafe X', type: 'cafe', lat: 50.2, lng: 20.2, openingHours: null, acceptsCards: null },
    ];

    handle.showPOIs(pois);

    expect(mocks.factory.circleMarker).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(mocks.factory.circleMarker).mock.calls;
    expect(calls[0][0]).toEqual([50.1, 20.1]);
    expect(calls[0][1]).toMatchObject({ color: '#ef4444' }); // fuel = red
    expect(calls[1][0]).toEqual([50.2, 20.2]);
    expect(calls[1][1]).toMatchObject({ color: '#6366f1' }); // cafe = indigo
  });

  // Slice 9: showPOIs binds popups with name, type, and card info
  it('showPOIs binds popups with name, type, and card info', () => {
    const pois: POI[] = [
      { id: 1, name: 'Shell', type: 'fuel', lat: 50.1, lng: 20.1, openingHours: 'Mo-Su 06:00-22:00', acceptsCards: true },
    ];

    handle.showPOIs(pois);

    const cm = mocks.circleMarkers[0];
    expect(cm.bindPopup).toHaveBeenCalledOnce();
    const popupHtml = cm.bindPopup.mock.calls[0][0] as string;
    expect(popupHtml).toContain('Shell');
    expect(popupHtml).toContain('fuel');
    expect(popupHtml).toContain('Cards: Yes');
  });

  // Slice 10: clearPOIs removes all POI markers
  it('clearPOIs removes all POI markers', () => {
    const pois: POI[] = [
      { id: 1, name: 'A', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
      { id: 2, name: 'B', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
    ];

    handle.showPOIs(pois);
    handle.clearPOIs();

    for (const cm of mocks.circleMarkers) {
      expect(cm.remove).toHaveBeenCalledOnce();
    }
  });

  // Slice 11: calling showPOIs again replaces previous markers
  it('showPOIs replaces previous POI markers', () => {
    const pois1: POI[] = [
      { id: 1, name: 'A', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    ];
    const pois2: POI[] = [
      { id: 2, name: 'B', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
    ];

    handle.showPOIs(pois1);
    const firstMarker = mocks.circleMarkers[0];
    expect(firstMarker.remove).not.toHaveBeenCalled();

    handle.showPOIs(pois2);
    expect(firstMarker.remove).toHaveBeenCalledOnce();
  });

  // Slice 14: highlightStop creates distinct marker
  it('highlightStop creates orange circleMarker with radius 10', () => {
    const poi: POI = { id: 1, name: 'Shell', type: 'fuel', lat: 50.1, lng: 20.1, openingHours: null, acceptsCards: null };
    handle.highlightStop(poi);

    const calls = vi.mocked(mocks.factory.circleMarker).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toEqual([50.1, 20.1]);
    expect(lastCall[1]).toMatchObject({ radius: 10, color: '#f97316' });
  });

  // Slice 15: highlightStop replaces previous
  it('highlightStop replaces previous highlight', () => {
    const poi1: POI = { id: 1, name: 'A', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null };
    const poi2: POI = { id: 2, name: 'B', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null };

    handle.highlightStop(poi1);
    const firstHighlight = mocks.circleMarkers[mocks.circleMarkers.length - 1];

    handle.highlightStop(poi2);
    expect(firstHighlight.remove).toHaveBeenCalledOnce();
  });

  // Slice 16: clearHighlight removes marker
  it('clearHighlight removes highlight marker', () => {
    const poi: POI = { id: 1, name: 'A', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null };
    handle.highlightStop(poi);
    const highlight = mocks.circleMarkers[mocks.circleMarkers.length - 1];

    handle.clearHighlight();
    expect(highlight.remove).toHaveBeenCalledOnce();
  });

  // Slice 17: zoomToFit calls fitBounds with positions
  it('zoomToFit calls fitBounds with given positions and padding', () => {
    handle.zoomToFit([{ lat: 50, lng: 20 }, { lat: 51, lng: 21 }]);

    expect(mocks.mockMap.fitBounds).toHaveBeenCalledWith(
      [[50, 20], [51, 21]],
      { padding: [50, 50] },
    );
  });

  // Slice 18: activate() hides placeholder and shows map without route
  it('activate hides placeholder and shows map', () => {
    const placeholder = container.querySelector('.map-placeholder') as HTMLElement;
    const mapInner = container.querySelector('.map-inner') as HTMLElement;

    expect(placeholder.hidden).toBe(false);
    expect(mapInner.hidden).toBe(true);

    handle.activate();

    expect(placeholder.hidden).toBe(true);
    expect(mapInner.hidden).toBe(false);
  });

  // Slice 19: clear() after activate() restores placeholder
  it('clear after activate restores placeholder', () => {
    handle.activate();
    handle.clear();

    const placeholder = container.querySelector('.map-placeholder') as HTMLElement;
    const mapInner = container.querySelector('.map-inner') as HTMLElement;
    expect(placeholder.hidden).toBe(false);
    expect(mapInner.hidden).toBe(true);
  });
});

describe('route-map with i18n', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Slice 27: placeholder uses translated text
  it('placeholder uses translated text', () => {
    const container = document.createElement('div');
    const mocks = createMockFactory();
    const i18n = createI18n('pl');
    initRouteMap(container, mocks.factory, i18n);

    const placeholder = container.querySelector('.map-placeholder') as HTMLElement;
    expect(placeholder.textContent).toBe('Wgraj plik GPX, aby zobaczyć trasę na mapie');
  });

  // Slice 28: off-route warning uses translated text with distance
  it('off-route warning uses translated text with distance', () => {
    const container = document.createElement('div');
    const mocks = createMockFactory();
    const i18n = createI18n('pl');
    const handle = initRouteMap(container, mocks.factory, i18n);

    handle.showOffRouteWarning(1500);
    const banner = container.querySelector('.off-route-warning') as HTMLElement;
    expect(banner.textContent).toBe('Jesteś poza trasą — 1.5 km');
  });

  // Slice 29: POI popup uses translated type + cards
  it('POI popup uses translated type and cards label', () => {
    const container = document.createElement('div');
    const mocks = createMockFactory();
    const i18n = createI18n('pl');
    initRouteMap(container, mocks.factory, i18n);

    const handle = initRouteMap(container, mocks.factory, i18n);
    const pois: POI[] = [
      { id: 1, name: 'Shell', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: true },
    ];
    handle.showPOIs(pois);

    const cm = mocks.circleMarkers[mocks.circleMarkers.length - 1];
    const popupHtml = cm.bindPopup.mock.calls[0][0] as string;
    expect(popupHtml).toContain('stacja paliw');
    expect(popupHtml).toContain('Karty: Tak');
  });
});
