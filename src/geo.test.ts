import { describe, it, expect, beforeEach } from 'vitest';
import { formatDistance } from './geo';
import { createI18n } from './i18n';

describe('formatDistance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('formats meters below 1000 as rounded meters', () => {
    expect(formatDistance(800)).toBe('800 m');
  });

  it('rounds fractional meters', () => {
    expect(formatDistance(123.7)).toBe('124 m');
  });

  it('formats 1000+ meters as km with one decimal', () => {
    expect(formatDistance(1500)).toBe('1.5 km');
  });

  it('formats exactly 1000m as 1.0 km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
  });

  it('uses i18n keys when i18n is provided (EN)', () => {
    const i18n = createI18n('en');
    expect(formatDistance(800, i18n)).toBe('800 m');
    expect(formatDistance(1500, i18n)).toBe('1.5 km');
  });

  it('uses i18n keys when i18n is provided (PL)', () => {
    const i18n = createI18n('pl');
    expect(formatDistance(800, i18n)).toBe('800 m');
    expect(formatDistance(1500, i18n)).toBe('1.5 km');
  });
});
