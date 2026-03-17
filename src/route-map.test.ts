import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeafletFactory, RouteMapHandle } from './route-map';
import { initRouteMap } from './route-map';
import type { ParsedRoute } from './gpx-parser';

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
  };
  const mockTileLayer = { addTo: vi.fn().mockReturnThis() };

  const polylines: Array<{ addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; getBounds: ReturnType<typeof vi.fn> }> = [];
  const markers: Array<{ addTo: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }> = [];

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
  };

  return { factory, mockMap, mockTileLayer, polylines, markers };
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
});
