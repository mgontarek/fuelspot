export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

import type { I18n } from './i18n';

export function formatDistance(meters: number, i18n?: I18n): string {
  if (meters < 1000) {
    const value = Math.round(meters).toString();
    return i18n ? i18n.t('distance.m', { value }) : `${value} m`;
  }
  const value = (meters / 1000).toFixed(1);
  return i18n ? i18n.t('distance.km', { value }) : `${value} km`;
}
