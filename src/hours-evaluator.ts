import OpeningHours from 'opening_hours';
import type { I18n } from './i18n';

export type HoursStatus = {
  status: 'open' | 'closed' | 'unknown';
  nextChange: Date | null;
  displayString: string;
};

export interface HoursParser {
  evaluate(openingHours: string, at: Date): {
    isOpen: boolean;
    isUnknown: boolean;
    nextChange: Date | null;
  };
}

export function evaluateHours(
  openingHours: string | null,
  at: Date,
  parser: HoursParser,
  i18n?: I18n,
): HoursStatus {
  if (openingHours === null) {
    return {
      status: 'unknown',
      nextChange: null,
      displayString: i18n ? i18n.t('hours.unknown') : 'Hours unknown',
    };
  }

  const result = parser.evaluate(openingHours, at);

  if (result.isUnknown) {
    return {
      status: 'unknown',
      nextChange: null,
      displayString: i18n ? i18n.t('hours.unknown') : 'Hours unknown',
    };
  }

  const locale = i18n ? (i18n.locale() === 'pl' ? 'pl-PL' : 'en-GB') : 'en-GB';

  if (result.isOpen) {
    return {
      status: 'open',
      nextChange: result.nextChange,
      displayString: result.nextChange
        ? i18n
          ? i18n.t('hours.openUntil', { time: formatTime(result.nextChange, locale) })
          : `Open until ${formatTime(result.nextChange, locale)}`
        : i18n ? i18n.t('hours.open247') : 'Open 24/7',
    };
  }

  return {
    status: 'closed',
    nextChange: result.nextChange,
    displayString: result.nextChange
      ? formatClosedDisplay(at, result.nextChange, locale, i18n)
      : i18n ? i18n.t('hours.closed') : 'Closed',
  };
}

function formatTime(date: Date, locale: string = 'en-GB'): string {
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function formatClosedDisplay(now: Date, nextChange: Date, locale: string, i18n?: I18n): string {
  const sameDay =
    now.getFullYear() === nextChange.getFullYear() &&
    now.getMonth() === nextChange.getMonth() &&
    now.getDate() === nextChange.getDate();

  const time = formatTime(nextChange, locale);

  if (sameDay) {
    return i18n ? i18n.t('hours.opensAt', { time }) : `Opens at ${time}`;
  }

  const dayName = nextChange.toLocaleDateString(locale, { weekday: 'short' });
  return i18n ? i18n.t('hours.opensDay', { day: dayName, time }) : `Opens ${dayName} ${time}`;
}

export function formatCountdown(from: Date, to: Date, i18n?: I18n): string {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 60_000) return i18n ? i18n.t('countdown.lessThanMinute') : '< 1m';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return i18n ? i18n.t('countdown.minutes', { minutes }) : `${minutes}m`;
  }
  return i18n
    ? i18n.t('countdown.hoursMinutes', { hours, minutes })
    : `${hours}h ${minutes}m`;
}

export function createOpeningHoursParser(): HoursParser {
  return {
    evaluate(openingHours: string, at: Date) {
      try {
        const oh = new OpeningHours(openingHours);
        return {
          isOpen: oh.getState(at),
          isUnknown: oh.getUnknown(at),
          nextChange: oh.getNextChange(at) ?? null,
        };
      } catch {
        return { isOpen: false, isUnknown: true, nextChange: null };
      }
    },
  };
}
