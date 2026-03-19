import 'leaflet/dist/leaflet.css';
import './style.css';
import * as L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { setDefaultFactory } from './route-map';
import { initUpload } from './upload';
import { createI18n } from './i18n';

// Fix Leaflet default marker icons broken by Vite bundling
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

setDefaultFactory({
  map: (container, options) => L.map(container, options),
  tileLayer: (url, options) => L.tileLayer(url, options),
  polyline: (latlngs, options) => L.polyline(latlngs, options),
  marker: (latlng, options) => L.marker(latlng, options),
  circleMarker: (latlng, options) => L.circleMarker(latlng, options),
});

const i18n = createI18n();

// Wire up language toggle
const langToggle = document.getElementById('lang-toggle');
if (langToggle) {
  langToggle.textContent = i18n.t('lang.toggle');
  langToggle.addEventListener('click', () => {
    i18n.setLocale(i18n.locale() === 'en' ? 'pl' : 'en');
  });
  i18n.onChange(() => {
    langToggle.textContent = i18n.t('lang.toggle');
    document.documentElement.lang = i18n.locale() === 'pl' ? 'pl' : 'en';
  });
}

initUpload(undefined, undefined, i18n);
