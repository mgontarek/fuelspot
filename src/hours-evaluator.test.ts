import { describe, test, expect, beforeEach } from 'vitest';
import { evaluateHours, formatCountdown, createOpeningHoursParser } from './hours-evaluator';
import type { HoursParser } from './hours-evaluator';
import { createI18n } from './i18n';
import type { I18n } from './i18n';

function stubParser(overrides: Partial<ReturnType<HoursParser['evaluate']>> = {}): HoursParser {
  return {
    evaluate: () => ({
      isOpen: false,
      isUnknown: false,
      nextChange: null,
      ...overrides,
    }),
  };
}

describe('evaluateHours', () => {
  const now = new Date('2026-03-16T10:00:00'); // Monday

  test('null opening_hours returns unknown', () => {
    const result = evaluateHours(null, now, stubParser());
    expect(result).toEqual({
      status: 'unknown',
      nextChange: null,
      displayString: 'Hours unknown',
    });
  });

  test('24/7 — open, no nextChange', () => {
    const parser = stubParser({ isOpen: true, isUnknown: false, nextChange: null });
    const result = evaluateHours('24/7', now, parser);
    expect(result.status).toBe('open');
    expect(result.nextChange).toBeNull();
    expect(result.displayString).toBe('Open 24/7');
  });

  test('open during hours shows open with nextChange', () => {
    const closesAt = new Date('2026-03-16T22:00:00');
    const parser = stubParser({ isOpen: true, nextChange: closesAt });
    const result = evaluateHours('Mo-Su 06:00-22:00', now, parser);
    expect(result.status).toBe('open');
    expect(result.nextChange).toEqual(closesAt);
    expect(result.displayString).toBe('Open until 22:00');
  });

  test('closed outside hours shows closed with nextChange', () => {
    const late = new Date('2026-03-16T23:00:00');
    const opensAt = new Date('2026-03-17T06:00:00'); // Tuesday
    const parser = stubParser({ isOpen: false, nextChange: opensAt });
    const result = evaluateHours('Mo-Su 06:00-22:00', late, parser);
    expect(result.status).toBe('closed');
    expect(result.nextChange).toEqual(opensAt);
    expect(result.displayString).toBe('Opens Tue 06:00');
  });

  test('closed, opens same day', () => {
    const morning = new Date('2026-03-16T05:00:00');
    const opensAt = new Date('2026-03-16T14:00:00');
    const parser = stubParser({ isOpen: false, nextChange: opensAt });
    const result = evaluateHours('Mo-Su 14:00-22:00', morning, parser);
    expect(result.displayString).toBe('Opens at 14:00');
  });

  test('midnight-spanning hours — open at 23:00', () => {
    const night = new Date('2026-03-16T23:00:00');
    const closesAt = new Date('2026-03-17T06:00:00');
    const parser = stubParser({ isOpen: true, nextChange: closesAt });
    const result = evaluateHours('Mo-Su 22:00-06:00', night, parser);
    expect(result.status).toBe('open');
    expect(result.displayString).toBe('Open until 06:00');
  });

  test('unparseable string falls back to unknown', () => {
    const parser: HoursParser = {
      evaluate: () => ({ isOpen: false, isUnknown: true, nextChange: null }),
    };
    const result = evaluateHours('garbage!!!', now, parser);
    expect(result.status).toBe('unknown');
    expect(result.displayString).toBe('Hours unknown');
  });
});

describe('formatCountdown', () => {
  test('formats hours and minutes', () => {
    const from = new Date('2026-03-16T10:00:00');
    const to = new Date('2026-03-16T12:15:00');
    expect(formatCountdown(from, to)).toBe('2h 15m');
  });

  test('formats minutes only', () => {
    const from = new Date('2026-03-16T10:00:00');
    const to = new Date('2026-03-16T10:45:00');
    expect(formatCountdown(from, to)).toBe('45m');
  });

  test('less than one minute', () => {
    const from = new Date('2026-03-16T10:00:00');
    const to = new Date('2026-03-16T10:00:30');
    expect(formatCountdown(from, to)).toBe('< 1m');
  });
});

describe('evaluateHours with i18n', () => {
  const now = new Date('2026-03-16T10:00:00'); // Monday
  let i18n: I18n;

  beforeEach(() => {
    localStorage.clear();
  });

  // Slice 11: null opening_hours returns localized 'Hours unknown'
  test('null opening_hours with i18n returns localized unknown', () => {
    i18n = createI18n('pl');
    const result = evaluateHours(null, now, stubParser(), i18n);
    expect(result.displayString).toBe('Godziny nieznane');
  });

  // Slice 12: open result uses i18n.t('hours.openUntil')
  test('open result uses localized display string', () => {
    i18n = createI18n('pl');
    const closesAt = new Date('2026-03-16T22:00:00');
    const parser = stubParser({ isOpen: true, nextChange: closesAt });
    const result = evaluateHours('Mo-Su 06:00-22:00', now, parser, i18n);
    expect(result.displayString).toContain('Otwarte do');
  });

  // Slice 13: closed same-day uses locale-aware time
  test('closed same-day uses locale-aware opensAt', () => {
    i18n = createI18n('pl');
    const morning = new Date('2026-03-16T05:00:00');
    const opensAt = new Date('2026-03-16T14:00:00');
    const parser = stubParser({ isOpen: false, nextChange: opensAt });
    const result = evaluateHours('Mo-Su 14:00-22:00', morning, parser, i18n);
    expect(result.displayString).toContain('Otwiera o');
  });

  // Slice 14: closed different-day uses Polish day name
  test('closed different-day uses Polish locale for day name', () => {
    i18n = createI18n('pl');
    const late = new Date('2026-03-16T23:00:00');
    const opensAt = new Date('2026-03-17T06:00:00');
    const parser = stubParser({ isOpen: false, nextChange: opensAt });
    const result = evaluateHours('Mo-Su 06:00-22:00', late, parser, i18n);
    expect(result.displayString).toContain('Otwiera');
  });

  // Slice 15: without i18n, backward compatible
  test('without i18n param, existing English behavior unchanged', () => {
    const result = evaluateHours(null, now, stubParser());
    expect(result.displayString).toBe('Hours unknown');

    const closesAt = new Date('2026-03-16T22:00:00');
    const parser = stubParser({ isOpen: true, nextChange: closesAt });
    const openResult = evaluateHours('Mo-Su 06:00-22:00', now, parser);
    expect(openResult.displayString).toBe('Open until 22:00');
  });
});

describe('formatCountdown with i18n', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('formats Polish countdown', () => {
    const i18n = createI18n('pl');
    const from = new Date('2026-03-16T10:00:00');
    const to = new Date('2026-03-16T12:15:00');
    expect(formatCountdown(from, to, i18n)).toBe('2 godz. 15 min');
  });

  test('formats Polish minutes only', () => {
    const i18n = createI18n('pl');
    const from = new Date('2026-03-16T10:00:00');
    const to = new Date('2026-03-16T10:45:00');
    expect(formatCountdown(from, to, i18n)).toBe('45 min');
  });

  test('formats Polish less than minute', () => {
    const i18n = createI18n('pl');
    const from = new Date('2026-03-16T10:00:00');
    const to = new Date('2026-03-16T10:00:30');
    expect(formatCountdown(from, to, i18n)).toBe('< 1 min');
  });
});

describe('createOpeningHoursParser — integration', () => {
  const parser = createOpeningHoursParser();

  test('24/7 is always open', () => {
    const result = parser.evaluate('24/7', new Date('2026-03-16T03:00:00'));
    expect(result.isOpen).toBe(true);
    expect(result.isUnknown).toBe(false);
  });

  test('Mo-Fr 08:00-18:00 is open on Monday at 10:00', () => {
    const monday10am = new Date('2026-03-16T10:00:00');
    const result = parser.evaluate('Mo-Fr 08:00-18:00', monday10am);
    expect(result.isOpen).toBe(true);
    expect(result.nextChange).not.toBeNull();
  });

  test('Mo-Fr 08:00-18:00 is closed on Monday at 20:00', () => {
    const monday8pm = new Date('2026-03-16T20:00:00');
    const result = parser.evaluate('Mo-Fr 08:00-18:00', monday8pm);
    expect(result.isOpen).toBe(false);
  });

  test('unparseable string returns unknown without throwing', () => {
    const result = parser.evaluate('not valid at all!!!', new Date());
    expect(result.isUnknown).toBe(true);
  });
});
