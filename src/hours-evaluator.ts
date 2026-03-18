import OpeningHours from 'opening_hours';

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
): HoursStatus {
  if (openingHours === null) {
    return { status: 'unknown', nextChange: null, displayString: 'Hours unknown' };
  }

  const result = parser.evaluate(openingHours, at);

  if (result.isUnknown) {
    return { status: 'unknown', nextChange: null, displayString: 'Hours unknown' };
  }

  if (result.isOpen) {
    return {
      status: 'open',
      nextChange: result.nextChange,
      displayString: result.nextChange
        ? `Open until ${formatTime(result.nextChange)}`
        : 'Open 24/7',
    };
  }

  return {
    status: 'closed',
    nextChange: result.nextChange,
    displayString: result.nextChange
      ? formatClosedDisplay(at, result.nextChange)
      : 'Closed',
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatClosedDisplay(now: Date, nextChange: Date): string {
  const sameDay =
    now.getFullYear() === nextChange.getFullYear() &&
    now.getMonth() === nextChange.getMonth() &&
    now.getDate() === nextChange.getDate();

  if (sameDay) {
    return `Opens at ${formatTime(nextChange)}`;
  }

  const dayName = nextChange.toLocaleDateString('en-GB', { weekday: 'short' });
  return `Opens ${dayName} ${formatTime(nextChange)}`;
}

export function formatCountdown(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 60_000) return '< 1m';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
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
