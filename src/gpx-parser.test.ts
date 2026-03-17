import { describe, it, expect } from 'vitest';
import { parseGPX } from './gpx-parser';
import {
  MINIMAL_2_TRKPT,
  THREE_TRKPT,
  RTEPT_ONLY,
  NO_NAME,
  EMPTY_GPX,
  KOMOOT_GPX,
  STRAVA_GPX,
  GARMIN_GPX,
  MULTI_SEGMENT,
} from './test-fixtures/gpx-samples';

describe('parseGPX', () => {
  // Slice 1: Rejects empty/non-XML input
  it('throws "Invalid GPX" for empty string', () => {
    expect(() => parseGPX('')).toThrow('Invalid GPX');
  });

  it('throws "Invalid GPX" for non-XML input', () => {
    expect(() => parseGPX('not xml at all')).toThrow('Invalid GPX');
  });

  it('throws "Invalid GPX" for valid XML without gpx root', () => {
    expect(() => parseGPX('<root><child/></root>')).toThrow('Invalid GPX');
  });

  // Slice 2: Rejects XML with no track or route points
  it('throws "No route points found" for GPX with no points', () => {
    expect(() => parseGPX(EMPTY_GPX)).toThrow('No route points found');
  });

  // Slice 3: Parses minimal GPX with 2 trkpt
  it('parses 2 trackpoints with correct lat/lng', () => {
    const result = parseGPX(MINIMAL_2_TRKPT);
    expect(result.points).toHaveLength(2);
    expect(result.points[0].lat).toBe(50.0);
    expect(result.points[0].lng).toBe(20.0);
    expect(result.points[1].lat).toBe(50.1);
    expect(result.points[1].lng).toBe(20.1);
    expect(result.points[0].cumulativeDistance).toBe(0);
  });

  // Slice 4: Computes cumulative haversine distance for 3+ points
  it('computes increasing cumulative distances for 3 points', () => {
    const result = parseGPX(THREE_TRKPT);
    expect(result.points).toHaveLength(3);
    expect(result.points[0].cumulativeDistance).toBe(0);
    expect(result.points[1].cumulativeDistance).toBeGreaterThan(0);
    expect(result.points[2].cumulativeDistance).toBeGreaterThan(
      result.points[1].cumulativeDistance,
    );
    expect(result.totalDistance).toBe(
      result.points[2].cumulativeDistance,
    );
  });

  it('computes reasonable haversine distance (~1.3 km for 0.01 deg)', () => {
    const result = parseGPX(THREE_TRKPT);
    // 0.01 degrees latitude ≈ 1.11 km
    const firstLeg = result.points[1].cumulativeDistance;
    expect(firstLeg).toBeGreaterThan(1000);
    expect(firstLeg).toBeLessThan(2000);
  });

  // Slice 5: Parses rtept as fallback
  it('extracts points from rtept when no trkpt exists', () => {
    const result = parseGPX(RTEPT_ONLY);
    expect(result.points).toHaveLength(2);
    expect(result.points[0].lat).toBe(51.0);
    expect(result.points[0].lng).toBe(17.0);
    expect(result.name).toBe('Route Points Test');
  });

  // Slice 6: Extracts route name
  it('extracts name from trk element', () => {
    const result = parseGPX(MINIMAL_2_TRKPT);
    expect(result.name).toBe('Test Route');
  });

  it('returns null name when absent', () => {
    const result = parseGPX(NO_NAME);
    expect(result.name).toBeNull();
  });

  // Slice 7: Handles real-world Komoot GPX
  it('parses Komoot GPX without error', () => {
    const result = parseGPX(KOMOOT_GPX);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.name).toBe('Morning Ride');
    expect(result.totalDistance).toBeGreaterThan(0);
  });

  // Slice 8: Handles real-world Strava GPX
  it('parses Strava GPX without error', () => {
    const result = parseGPX(STRAVA_GPX);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.totalDistance).toBeGreaterThan(0);
  });

  // Slice 9: Handles real-world Garmin GPX
  it('parses Garmin GPX without error', () => {
    const result = parseGPX(GARMIN_GPX);
    expect(result.points.length).toBeGreaterThan(0);
  });

  // Slice 10: Concatenates points from multiple trkseg
  it('concatenates points from multiple trkseg elements', () => {
    const result = parseGPX(MULTI_SEGMENT);
    expect(result.points).toHaveLength(4);
    expect(result.name).toBe('Multi-segment Route');

    // Cumulative distance should be continuous across segments
    for (let i = 1; i < result.points.length; i++) {
      expect(result.points[i].cumulativeDistance).toBeGreaterThan(
        result.points[i - 1].cumulativeDistance,
      );
    }
  });
});
