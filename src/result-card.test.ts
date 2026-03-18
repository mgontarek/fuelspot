import { describe, it, expect, beforeEach } from 'vitest';
import { initResultCard } from './result-card';
import type { ResultCardHandle } from './result-card';
import type { RankedStop } from './stop-ranker';

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
