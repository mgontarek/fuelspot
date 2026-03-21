import { describe, it, expect, beforeEach } from 'vitest';
import { initResultCard } from './result-card';
import type { ResultCardHandle } from './result-card';
import type { RankedStop } from './stop-ranker';
import { createI18n } from './i18n';

function makeStop(overrides: Partial<RankedStop> = {}): RankedStop {
  return {
    poi: {
      id: 1,
      name: 'Shell',
      type: 'fuel',
      lat: 50,
      lng: 20,
      openingHours: 'Mo-Su 06:00-22:00',
      acceptsCards: true,
    },
    hours: { status: 'open', nextChange: new Date('2026-03-18T22:00:00'), displayString: 'Open until 22:00' },
    distanceAlongRoute: 2500,
    straightLineDistance: 2100,
    countdown: null,
    ...overrides,
  };
}

describe('result-card', () => {
  let container: HTMLElement;
  let card: ResultCardHandle;

  beforeEach(() => {
    container = document.createElement('div');
    card = initResultCard(container);
  });

  // Slice 1: Init returns handle, card starts hidden
  it('initializes with hidden wrapper', () => {
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.hidden).toBe(true);
  });

  // Slice 2: Loading state
  it('showLoading shows searching text', () => {
    card.showLoading();
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('Searching for stops...');
  });

  // Slice 3: Render open stop with all fields
  it('showStop renders open stop with name, type, distance, hours, cards', () => {
    card.showStop(makeStop());
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('Shell');
    expect(wrapper.textContent).toContain('fuel');
    expect(wrapper.textContent).toContain('2.5 km');
    expect(wrapper.textContent).toContain('Open until 22:00');
    expect(wrapper.textContent).toContain('Cards: Yes');
  });

  // Slice 4: Render closed stop with countdown
  it('showStop renders closed stop with countdown', () => {
    card.showStop(makeStop({
      hours: {
        status: 'closed',
        nextChange: new Date('2026-03-19T06:00:00'),
        displayString: 'Opens Thu 06:00',
      },
      countdown: '1h 30m',
    }));
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.querySelector('.badge-closed')).not.toBeNull();
    expect(wrapper.textContent).toContain('opens in 1h 30m');
    expect(wrapper.textContent).toContain('Opens Thu 06:00');
  });

  // Slice 5: Render unknown-hours stop
  it('showStop renders unknown hours stop', () => {
    card.showStop(makeStop({
      hours: { status: 'unknown', nextChange: null, displayString: 'Hours unknown' },
    }));
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.textContent).toContain('Hours unknown');
    expect(wrapper.querySelector('.badge-unknown')).not.toBeNull();
  });

  // Slice 6: Off-route distance display
  it('shows straight line distance when not on route', () => {
    card.showStop(makeStop({
      distanceAlongRoute: null,
      straightLineDistance: 1200,
    }));
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.textContent).toContain('1.2 km (straight line)');
  });

  // Slice 7: Null name fallback
  it('shows Unnamed when poi name is null', () => {
    card.showStop(makeStop({
      poi: { id: 1, name: null, type: 'cafe', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    }));
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.textContent).toContain('Unnamed');
    expect(wrapper.textContent).toContain('cafe');
  });

  // Slice 8: Card payment states
  it('shows Unknown for null acceptsCards, No for false', () => {
    card.showStop(makeStop({
      poi: { id: 1, name: 'X', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    }));
    expect(container.textContent).toContain('Cards: Unknown');

    card.showStop(makeStop({
      poi: { id: 2, name: 'Y', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: false },
    }));
    expect(container.textContent).toContain('Cards: No');
  });

  // Slice 9: Error state
  it('showError displays error text', () => {
    card.showError('GPS denied');
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('GPS denied');
  });

  // Slice 10: Empty state
  it('showEmpty displays no stops message', () => {
    card.showEmpty();
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('No stops found');
  });

  // Slice 11: Waiting for GPS state
  it('showWaitingForGps displays waiting message', () => {
    card.showWaitingForGps();
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('Waiting for GPS...');
  });

  // Slice 12: Clear hides card
  it('clear hides card after showStop', () => {
    card.showStop(makeStop());
    card.clear();
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(true);
  });

  // Slice 13: Repeat showStop replaces content
  it('second showStop replaces first', () => {
    card.showStop(makeStop({ poi: { id: 1, name: 'First', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null } }));
    card.showStop(makeStop({ poi: { id: 2, name: 'Second', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null } }));
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.textContent).not.toContain('First');
    expect(wrapper.textContent).toContain('Second');
  });
});

describe('result-card showStops (proximity mode)', () => {
  let container: HTMLElement;
  let card: ResultCardHandle;

  beforeEach(() => {
    container = document.createElement('div');
    card = initResultCard(container);
  });

  it('showStops with empty array shows no stops message', () => {
    card.showStops([]);
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('No stops found');
  });

  it('showStops with 1 stop renders it without section labels', () => {
    card.showStops([makeStop()]);
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('Shell');
    expect(wrapper.textContent).toContain('fuel');
    expect(wrapper.textContent).toContain('2.5 km');
    expect(wrapper.querySelectorAll('.result-stop').length).toBe(1);
    expect(wrapper.querySelector('.result-section-label')).toBeNull();
  });

  it('showStops with 2 stops renders both with section labels', () => {
    const primary = makeStop({
      poi: { id: 1, name: 'Primary Stop', type: 'fuel', lat: 50, lng: 20, openingHours: 'Mo-Su 06:00-22:00', acceptsCards: true },
    });
    const backup = makeStop({
      poi: { id: 2, name: 'Backup Stop', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
      hours: { status: 'unknown', nextChange: null, displayString: 'Hours unknown' },
    });
    card.showStops([primary, backup]);
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.textContent).toContain('Primary Stop');
    expect(wrapper.textContent).toContain('Backup Stop');
    expect(wrapper.querySelectorAll('.result-stop').length).toBe(2);
    const labels = wrapper.querySelectorAll('.result-section-label');
    expect(labels.length).toBe(2);
    expect(labels[0].textContent).toBe('Nearest stop');
    expect(labels[1].textContent).toBe('Backup stop');
  });

  it('showStops renders independent status badges per section', () => {
    const primary = makeStop({
      poi: { id: 1, name: 'Open Place', type: 'fuel', lat: 50, lng: 20, openingHours: 'Mo-Su 06:00-22:00', acceptsCards: true },
      hours: { status: 'open', nextChange: null, displayString: 'Open 24/7' },
    });
    const backup = makeStop({
      poi: { id: 2, name: 'Unknown Place', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
      hours: { status: 'unknown', nextChange: null, displayString: 'Hours unknown' },
    });
    card.showStops([primary, backup]);
    const stops = container.querySelectorAll('.result-stop');
    expect(stops[0].querySelector('.badge-open')).not.toBeNull();
    expect(stops[1].querySelector('.badge-unknown')).not.toBeNull();
  });

  it('showStops replaces previous showStop content', () => {
    card.showStop(makeStop({
      poi: { id: 1, name: 'Old Stop', type: 'fuel', lat: 50, lng: 20, openingHours: null, acceptsCards: null },
    }));
    card.showStops([makeStop({
      poi: { id: 2, name: 'New Stop', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
    })]);
    const wrapper = container.querySelector('.result-card') as HTMLElement;
    expect(wrapper.textContent).not.toContain('Old Stop');
    expect(wrapper.textContent).toContain('New Stop');
  });
});

describe('result-card with i18n', () => {
  let container: HTMLElement;
  let card: ResultCardHandle;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
  });

  // Slice 16: showLoading uses translated text
  it('showLoading uses translated text', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showLoading();
    expect(container.textContent).toContain('Szukam przystanków...');
  });

  // Slice 17: showEmpty uses translated text
  it('showEmpty uses translated text', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showEmpty();
    expect(container.textContent).toContain('Nie znaleziono przystanków w pobliżu');
  });

  // Slice 18: showWaitingForGps uses translated text
  it('showWaitingForGps uses translated text', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showWaitingForGps();
    expect(container.textContent).toContain('Oczekiwanie na GPS...');
  });

  // Slice 19: showStop renders translated POI type
  it('showStop renders translated POI type', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showStop(makeStop());
    expect(container.textContent).toContain('stacja paliw');
  });

  // Slice 20: showStop renders translated badge text
  it('showStop renders translated badge text', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showStop(makeStop());
    expect(container.textContent).toContain('Otwarte');
  });

  // Slice 21: showStop renders translated cards label
  it('showStop renders translated cards label', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showStop(makeStop());
    expect(container.textContent).toContain('Karty: Tak');
  });

  it('showStops with 2 stops renders translated section labels', () => {
    const i18n = createI18n('pl');
    card = initResultCard(container, i18n);
    card.showStops([makeStop(), makeStop({
      poi: { id: 2, name: 'Backup', type: 'cafe', lat: 51, lng: 21, openingHours: null, acceptsCards: null },
    })]);
    const labels = container.querySelectorAll('.result-section-label');
    expect(labels[0].textContent).toBe('Najbliższy przystanek');
    expect(labels[1].textContent).toBe('Zapasowy przystanek');
  });

  // Slice 22: Switching locale and re-rendering produces Polish text
  it('switching locale and re-rendering produces Polish text', () => {
    const i18n = createI18n('en');
    card = initResultCard(container, i18n);
    card.showStop(makeStop());
    expect(container.textContent).toContain('Cards: Yes');

    i18n.setLocale('pl');
    card.showStop(makeStop());
    expect(container.textContent).toContain('Karty: Tak');
  });
});
