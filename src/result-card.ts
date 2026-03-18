import type { RankedStop } from './stop-ranker';

export interface ResultCardHandle {
  showStop(stop: RankedStop): void;
  showLoading(): void;
  showError(message: string): void;
  showEmpty(): void;
  showWaitingForGps(): void;
  clear(): void;
}

export function initResultCard(container: HTMLElement): ResultCardHandle {
  const wrapper = document.createElement('div');
  wrapper.className = 'result-card';
  wrapper.hidden = true;
  container.appendChild(wrapper);

  function setContent(html: string): void {
    wrapper.innerHTML = html;
    wrapper.hidden = false;
  }

  function showStop(stop: RankedStop): void {
    const name = stop.poi.name ?? 'Unnamed';
    const type = stop.poi.type;

    const distance =
      stop.distanceAlongRoute !== null
        ? `${(stop.distanceAlongRoute / 1000).toFixed(1)} km`
        : `${(stop.straightLineDistance / 1000).toFixed(1)} km (straight line)`;

    const statusClass = `status-${stop.hours.status}`;
    const statusBadge =
      stop.hours.status === 'open'
        ? '<span class="badge badge-open">Open</span>'
        : stop.hours.status === 'closed'
          ? '<span class="badge badge-closed">Closed</span>'
          : '<span class="badge badge-unknown">Unknown</span>';

    const hoursLine =
      stop.hours.status === 'unknown'
        ? 'Hours unknown'
        : stop.hours.displayString;

    const countdownLine =
      stop.countdown ? `<p class="result-countdown">opens in ${stop.countdown}</p>` : '';

    const cards =
      stop.poi.acceptsCards === true
        ? 'Yes'
        : stop.poi.acceptsCards === false
          ? 'No'
          : 'Unknown';

    setContent(`
      <div class="result-stop ${statusClass}">
        <div class="result-header">
          <h3 class="result-name">${name}</h3>
          ${statusBadge}
        </div>
        <p class="result-type">${type}</p>
        <p class="result-distance">${distance}</p>
        <p class="result-hours">${hoursLine}</p>
        ${countdownLine}
        <p class="result-cards">Cards: ${cards}</p>
      </div>
    `);
  }

  function showLoading(): void {
    setContent('<p class="result-loading">Searching for stops...</p>');
  }

  function showError(message: string): void {
    setContent(`<p class="result-error">${message}</p>`);
  }

  function showEmpty(): void {
    setContent('<p class="result-empty">No stops found nearby</p>');
  }

  function showWaitingForGps(): void {
    setContent('<p class="result-waiting">Waiting for GPS...</p>');
  }

  function clear(): void {
    wrapper.innerHTML = '';
    wrapper.hidden = true;
  }

  return { showStop, showLoading, showError, showEmpty, showWaitingForGps, clear };
}
