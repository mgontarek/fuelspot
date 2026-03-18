import { describe, test, expect } from 'vitest';
import { evaluateHours, formatCountdown, createOpeningHoursParser } from './hours-evaluator';
import type { HoursParser } from './hours-evaluator';

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
