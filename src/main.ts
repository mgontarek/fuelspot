import 'leaflet/dist/leaflet.css';
import './style.css';
import * as L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { setDefaultFactory } from './route-map';
import { initUpload } from './upload';

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
});

initUpload();
