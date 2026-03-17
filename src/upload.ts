import { parseGPX } from './gpx-parser';
import type { ParsedRoute } from './gpx-parser';

const STORAGE_KEY = 'fuelspot-gpx';

export function initUpload(): void {
  const fileInput = document.getElementById('gpx-input') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const statsSection = document.getElementById('route-stats') as HTMLElement;
  const errorSection = document.getElementById('error-display') as HTMLElement;
  const routeName = document.getElementById('route-name') as HTMLElement;
  const pointCount = document.getElementById('point-count') as HTMLElement;
  const routeDistance = document.getElementById('route-distance') as HTMLElement;

  function showRoute(route: ParsedRoute): void {
    routeName.textContent = route.name ?? 'Unnamed route';
    pointCount.textContent = `${route.points.length} points`;
    routeDistance.textContent = `${(route.totalDistance / 1000).toFixed(1)} km`;
    statsSection.hidden = false;
    errorSection.hidden = true;
    clearBtn.hidden = false;
  }

  function showError(message: string): void {
    errorSection.textContent = message;
    errorSection.hidden = false;
    statsSection.hidden = true;
  }

  function resetUI(): void {
    statsSection.hidden = true;
    errorSection.hidden = true;
    clearBtn.hidden = true;
    fileInput.value = '';
  }

  // Load from localStorage on init
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      showRoute(parseGPX(stored));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const gpxString = reader.result as string;
      try {
        const route = parseGPX(gpxString);
        localStorage.setItem(STORAGE_KEY, gpxString);
        showRoute(route);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to parse GPX');
      }
    };
    reader.readAsText(file);
  });

  clearBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    resetUI();
  });
}
