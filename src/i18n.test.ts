import { describe, test, expect, beforeEach } from 'vitest';
import { createI18n } from './i18n';

describe('i18n core', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Slice 1: Factory returns object with correct shape
  test('createI18n() returns object with t, locale, setLocale, onChange', () => {
    const i18n = createI18n();
    expect(typeof i18n.t).toBe('function');
    expect(typeof i18n.locale).toBe('function');
    expect(typeof i18n.setLocale).toBe('function');
    expect(typeof i18n.onChange).toBe('function');
  });

  // Slice 2: EN lookup
  test("t('app.title') returns 'FuelSpot' in default locale", () => {
    const i18n = createI18n('en');
    expect(i18n.t('app.title')).toBe('FuelSpot');
  });

  // Slice 3: Param substitution
  test("t('route.points', { count: '42' }) returns '42 points'", () => {
    const i18n = createI18n('en');
    expect(i18n.t('route.points', { count: '42' })).toBe('42 points');
  });

  // Slice 4: PL dictionary
  test("setLocale('pl') → t('app.subtitle') returns Polish string", () => {
    const i18n = createI18n('en');
    i18n.setLocale('pl');
    expect(i18n.t('app.subtitle')).toBe('Znajdź otwarte sklepy na trasie');
  });

  // Slice 5: localStorage persistence
  test("setLocale('pl') persists 'pl' to localStorage", () => {
    const i18n = createI18n('en');
    i18n.setLocale('pl');
    expect(localStorage.getItem('fuelspot-lang')).toBe('pl');
  });

  // Slice 6: Reads initial locale from localStorage
  test('createI18n() reads initial locale from localStorage', () => {
    localStorage.setItem('fuelspot-lang', 'pl');
    const i18n = createI18n();
    expect(i18n.locale()).toBe('pl');
    expect(i18n.t('app.subtitle')).toBe('Znajdź otwarte sklepy na trasie');
  });

  // Slice 7: onChange fires on setLocale
  test('onChange(cb) fires cb when setLocale called', () => {
    const i18n = createI18n('en');
    let called = false;
    i18n.onChange(() => { called = true; });
    i18n.setLocale('pl');
    expect(called).toBe(true);
  });

  // Slice 8: Unsubscribe
  test('onChange returns unsubscribe function', () => {
    const i18n = createI18n('en');
    let callCount = 0;
    const unsub = i18n.onChange(() => { callCount++; });
    i18n.setLocale('pl');
    expect(callCount).toBe(1);

    unsub();
    i18n.setLocale('en');
    expect(callCount).toBe(1);
  });

  // Slice 9: Missing key fallback
  test("t('missing.key') returns key as fallback", () => {
    const i18n = createI18n('en');
    expect(i18n.t('missing.key')).toBe('missing.key');
  });

  // Slice 10: Every EN key exists in PL dictionary
  test('every EN key exists in PL dictionary', () => {
    const enI18n = createI18n('en');
    const plI18n = createI18n('pl');

    // Get all EN keys by testing known keys
    const knownKeys = [
      'app.title', 'app.subtitle',
      'upload.label', 'upload.clear', 'upload.refresh', 'upload.loading',
      'route.unnamed', 'route.points', 'route.distance', 'route.parseFailed', 'route.loadFailed',
      'gps.denied', 'gps.unavailable', 'gps.waiting',
      'card.searching', 'card.empty', 'card.unnamed', 'card.hoursUnknown', 'card.opensIn',
      'card.cardsYes', 'card.cardsNo', 'card.cardsUnknown', 'card.cardsLabel',
      'card.distanceRoute', 'card.distanceStraight',
      'badge.open', 'badge.closed', 'badge.unknown',
      'hours.unknown', 'hours.openUntil', 'hours.open247', 'hours.opensAt', 'hours.opensDay', 'hours.closed',
      'countdown.lessThanMinute', 'countdown.minutes', 'countdown.hoursMinutes',
      'poi.fuel', 'poi.convenience', 'poi.supermarket', 'poi.bakery', 'poi.restaurant', 'poi.cafe',
      'map.placeholder', 'map.offRoute', 'map.offRouteDistance',
      'distance.m', 'distance.km',
      'overpass.busy',
      'lang.toggle',
    ];

    for (const key of knownKeys) {
      // EN key should NOT return the key itself (it should have a translation)
      expect(enI18n.t(key)).not.toBe(key);
      // PL key should NOT return the key itself (it should have a translation)
      expect(plI18n.t(key)).not.toBe(key);
    }
  });

  // Slice: locale() returns current locale
  test('locale() returns current locale', () => {
    const i18n = createI18n('en');
    expect(i18n.locale()).toBe('en');
    i18n.setLocale('pl');
    expect(i18n.locale()).toBe('pl');
  });

  // Slice: numeric param substitution
  test('t() handles numeric params', () => {
    const i18n = createI18n('en');
    expect(i18n.t('route.points', { count: 42 })).toBe('42 points');
  });
});

describe('i18n PL translations', () => {
  test('POI types are translated to Polish', () => {
    const i18n = createI18n('pl');
    expect(i18n.t('poi.fuel')).toBe('stacja paliw');
    expect(i18n.t('poi.cafe')).toBe('kawiarnia');
    expect(i18n.t('poi.bakery')).toBe('piekarnia');
  });

  test('badges are translated to Polish', () => {
    const i18n = createI18n('pl');
    expect(i18n.t('badge.open')).toBe('Otwarte');
    expect(i18n.t('badge.closed')).toBe('Zamknięte');
  });

  test('card labels are translated to Polish', () => {
    const i18n = createI18n('pl');
    expect(i18n.t('card.searching')).toBe('Szukam przystanków...');
    expect(i18n.t('card.empty')).toBe('Nie znaleziono przystanków w pobliżu');
  });
});
