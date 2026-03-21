import type { RankedStop } from './stop-ranker';
import type { I18n } from './i18n';

export interface ResultCardHandle {
  showStop(stop: RankedStop): void;
  showStops(stops: RankedStop[]): void;
  showLoading(): void;
  showError(message: string): void;
  showEmpty(): void;
  showWaitingForGps(): void;
  clear(): void;
}

export function initResultCard(container: HTMLElement, i18n?: I18n): ResultCardHandle {
  const wrapper = document.createElement('div');
  wrapper.className = 'result-card';
  wrapper.hidden = true;
  container.appendChild(wrapper);

  function tt(key: string, params?: Record<string, string | number>): string {
    return i18n ? i18n.t(key, params) : fallback(key, params);
  }

  function setContent(html: string): void {
    wrapper.innerHTML = html;
    wrapper.hidden = false;
  }

  function renderStopHtml(stop: RankedStop): string {
    const name = stop.poi.name ?? tt('card.unnamed');
    const type = tt(`poi.${stop.poi.type}`);

    const distVal = stop.distanceAlongRoute !== null
      ? (stop.distanceAlongRoute / 1000).toFixed(1)
      : (stop.straightLineDistance / 1000).toFixed(1);
    const distance = stop.distanceAlongRoute !== null
      ? tt('card.distanceRoute', { distance: distVal })
      : tt('card.distanceStraight', { distance: distVal });

    const statusClass = `status-${stop.hours.status}`;
    const badgeText = tt(`badge.${stop.hours.status}`);
    const statusBadge = `<span class="badge badge-${stop.hours.status}">${badgeText}</span>`;

    const hoursLine =
      stop.hours.status === 'unknown'
        ? tt('card.hoursUnknown')
        : stop.hours.displayString;

    const countdownLine =
      stop.countdown ? `<p class="result-countdown">${tt('card.opensIn', { countdown: stop.countdown })}</p>` : '';

    const cardsValue =
      stop.poi.acceptsCards === true
        ? tt('card.cardsYes')
        : stop.poi.acceptsCards === false
          ? tt('card.cardsNo')
          : tt('card.cardsUnknown');

    return `
      <div class="result-stop ${statusClass}">
        <div class="result-header">
          <h3 class="result-name">${name}</h3>
          ${statusBadge}
        </div>
        <p class="result-type">${type}</p>
        <p class="result-distance">${distance}</p>
        <p class="result-hours">${hoursLine}</p>
        ${countdownLine}
        <p class="result-cards">${tt('card.cardsLabel', { value: cardsValue })}</p>
      </div>
    `;
  }

  function showStop(stop: RankedStop): void {
    setContent(renderStopHtml(stop));
  }

  function showStops(stops: RankedStop[]): void {
    if (stops.length === 0) {
      showEmpty();
      return;
    }
    if (stops.length === 1) {
      setContent(renderStopHtml(stops[0]));
      return;
    }
    const sections = [
      `<h4 class="result-section-label">${tt('card.primaryLabel')}</h4>${renderStopHtml(stops[0])}`,
      `<h4 class="result-section-label">${tt('card.backupLabel')}</h4>${renderStopHtml(stops[1])}`,
    ];
    setContent(sections.join(''));
  }

  function showLoading(): void {
    setContent(`<p class="result-loading">${tt('card.searching')}</p>`);
  }

  function showError(message: string): void {
    setContent(`<p class="result-error">${message}</p>`);
  }

  function showEmpty(): void {
    setContent(`<p class="result-empty">${tt('card.empty')}</p>`);
  }

  function showWaitingForGps(): void {
    setContent(`<p class="result-waiting">${tt('gps.waiting')}</p>`);
  }

  function clear(): void {
    wrapper.innerHTML = '';
    wrapper.hidden = true;
  }

  return { showStop, showStops, showLoading, showError, showEmpty, showWaitingForGps, clear };
}

// Fallback English strings when no i18n is provided (backward compat)
function fallback(key: string, params?: Record<string, string | number>): string {
  const map: Record<string, string> = {
    'card.searching': 'Searching for stops...',
    'card.empty': 'No stops found nearby',
    'card.unnamed': 'Unnamed',
    'card.hoursUnknown': 'Hours unknown',
    'card.opensIn': 'opens in {countdown}',
    'card.cardsYes': 'Yes',
    'card.cardsNo': 'No',
    'card.cardsUnknown': 'Unknown',
    'card.cardsLabel': 'Cards: {value}',
    'card.distanceRoute': '{distance} km',
    'card.distanceStraight': '{distance} km (straight line)',
    'badge.open': 'Open',
    'badge.closed': 'Closed',
    'badge.unknown': 'Unknown',
    'card.primaryLabel': 'Nearest stop',
    'card.backupLabel': 'Backup stop',
    'gps.waiting': 'Waiting for GPS...',
    'poi.fuel': 'fuel',
    'poi.convenience': 'convenience',
    'poi.supermarket': 'supermarket',
    'poi.bakery': 'bakery',
    'poi.restaurant': 'restaurant',
    'poi.cafe': 'cafe',
  };
  let value = map[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}
