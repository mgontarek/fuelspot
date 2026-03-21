export type Locale = 'en' | 'pl';

export interface I18n {
  t(key: string, params?: Record<string, string | number>): string;
  locale(): Locale;
  setLocale(locale: Locale): void;
  onChange(callback: () => void): () => void;
}

const STORAGE_KEY = 'fuelspot-lang';

const en: Record<string, string> = {
  'app.title': 'FuelSpot',
  'app.subtitle': 'Find open resupply stops along your route',
  'upload.label': 'Upload GPX file',
  'upload.clear': 'Clear route',
  'upload.refresh': 'Refresh stops',
  'route.unnamed': 'Unnamed route',
  'route.distance': '{distance} km',
  'route.parseFailed': 'Failed to parse GPX',
  'route.loadFailed': 'Failed to load stops',
  'gps.denied': 'GPS access denied — enable location to find stops',
  'gps.unavailable': 'GPS position not available — enable location to find stops',
  'gps.waiting': 'Waiting for GPS...',
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
  'card.primaryLabel': 'Nearest stop',
  'card.backupLabel': 'Backup stop',
  'badge.open': 'Open',
  'badge.closed': 'Closed',
  'badge.unknown': 'Unknown',
  'hours.unknown': 'Hours unknown',
  'hours.openUntil': 'Open until {time}',
  'hours.open247': 'Open 24/7',
  'hours.opensAt': 'Opens at {time}',
  'hours.opensDay': 'Opens {day} {time}',
  'hours.closed': 'Closed',
  'countdown.lessThanMinute': '< 1m',
  'countdown.minutes': '{minutes}m',
  'countdown.hoursMinutes': '{hours}h {minutes}m',
  'poi.fuel': 'fuel',
  'poi.convenience': 'convenience',
  'poi.supermarket': 'supermarket',
  'poi.bakery': 'bakery',
  'poi.restaurant': 'restaurant',
  'poi.cafe': 'cafe',
  'map.placeholder': 'Upload a GPX file to see your route on the map',
  'map.offRoute': 'You are off route',
  'map.offRouteDistance': 'You are off route — {distance} away',
  'distance.m': '{value} m',
  'distance.km': '{value} km',
  'overpass.busy': 'Overpass API is busy — please try again in a minute',
  'storage.quotaWarning': 'Route is too large to save for offline use — it will not persist across reloads',
  'lang.toggle': 'PL',
};

const pl: Record<string, string> = {
  'app.title': 'FuelSpot',
  'app.subtitle': 'Znajdź otwarte sklepy na trasie',
  'upload.label': 'Wgraj plik GPX',
  'upload.clear': 'Wyczyść trasę',
  'upload.refresh': 'Odśwież przystanki',
  'route.unnamed': 'Trasa bez nazwy',
  'route.distance': '{distance} km',
  'route.parseFailed': 'Nie udało się odczytać pliku GPX',
  'route.loadFailed': 'Nie udało się załadować przystanków',
  'gps.denied': 'Brak dostępu do GPS — włącz lokalizację',
  'gps.unavailable': 'Pozycja GPS niedostępna — włącz lokalizację',
  'gps.waiting': 'Oczekiwanie na GPS...',
  'card.searching': 'Szukam przystanków...',
  'card.empty': 'Nie znaleziono przystanków w pobliżu',
  'card.unnamed': 'Bez nazwy',
  'card.hoursUnknown': 'Godziny nieznane',
  'card.opensIn': 'otwiera za {countdown}',
  'card.cardsYes': 'Tak',
  'card.cardsNo': 'Nie',
  'card.cardsUnknown': 'Nieznane',
  'card.cardsLabel': 'Karty: {value}',
  'card.distanceRoute': '{distance} km',
  'card.distanceStraight': '{distance} km (w linii prostej)',
  'card.primaryLabel': 'Najbliższy przystanek',
  'card.backupLabel': 'Zapasowy przystanek',
  'badge.open': 'Otwarte',
  'badge.closed': 'Zamknięte',
  'badge.unknown': 'Nieznane',
  'hours.unknown': 'Godziny nieznane',
  'hours.openUntil': 'Otwarte do {time}',
  'hours.open247': 'Otwarte 24/7',
  'hours.opensAt': 'Otwiera o {time}',
  'hours.opensDay': 'Otwiera {day} {time}',
  'hours.closed': 'Zamknięte',
  'countdown.lessThanMinute': '< 1 min',
  'countdown.minutes': '{minutes} min',
  'countdown.hoursMinutes': '{hours} godz. {minutes} min',
  'poi.fuel': 'stacja paliw',
  'poi.convenience': 'sklep',
  'poi.supermarket': 'supermarket',
  'poi.bakery': 'piekarnia',
  'poi.restaurant': 'restauracja',
  'poi.cafe': 'kawiarnia',
  'map.placeholder': 'Wgraj plik GPX, aby zobaczyć trasę na mapie',
  'map.offRoute': 'Jesteś poza trasą',
  'map.offRouteDistance': 'Jesteś poza trasą — {distance}',
  'distance.m': '{value} m',
  'distance.km': '{value} km',
  'overpass.busy': 'Serwer Overpass jest zajęty — spróbuj ponownie za minutę',
  'storage.quotaWarning': 'Trasa jest za duży, aby zapisać do użytku offline — nie zostanie zachowana po odświeżeniu',
  'lang.toggle': 'EN',
};

const dictionaries: Record<Locale, Record<string, string>> = { en, pl };

export function createI18n(initialLocale?: Locale): I18n {
  let currentLocale: Locale =
    initialLocale ??
    (localStorage.getItem(STORAGE_KEY) as Locale | null) ??
    (typeof navigator !== 'undefined' && navigator.language.startsWith('pl') ? 'pl' : 'en');

  const subscribers: Set<() => void> = new Set();

  function t(key: string, params?: Record<string, string | number>): string {
    let value = dictionaries[currentLocale][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  }

  function locale(): Locale {
    return currentLocale;
  }

  function setLocale(loc: Locale): void {
    currentLocale = loc;
    localStorage.setItem(STORAGE_KEY, loc);
    for (const cb of subscribers) {
      cb();
    }
  }

  function onChange(callback: () => void): () => void {
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }

  return { t, locale, setLocale, onChange };
}
