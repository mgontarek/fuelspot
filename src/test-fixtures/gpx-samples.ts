/** Minimal GPX with 2 trackpoints */
export const MINIMAL_2_TRKPT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <name>Test Route</name>
    <trkseg>
      <trkpt lat="50.0" lon="20.0"></trkpt>
      <trkpt lat="50.1" lon="20.1"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** GPX with 3 trackpoints for distance verification */
export const THREE_TRKPT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="50.0" lon="20.0"></trkpt>
      <trkpt lat="50.01" lon="20.01"></trkpt>
      <trkpt lat="50.02" lon="20.02"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** GPX with only rtept (route points, no tracks) */
export const RTEPT_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <rte>
    <name>Route Points Test</name>
    <rtept lat="51.0" lon="17.0"></rtept>
    <rtept lat="51.1" lon="17.1"></rtept>
  </rte>
</gpx>`;

/** GPX with no name element */
export const NO_NAME = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="50.0" lon="20.0"></trkpt>
      <trkpt lat="50.1" lon="20.1"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** GPX with no track or route points */
export const EMPTY_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <metadata><name>Empty</name></metadata>
</gpx>`;

/** Real-world Komoot-style GPX */
export const KOMOOT_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"
     creator="https://www.komoot.de">
  <metadata>
    <name>Komoot Tour</name>
  </metadata>
  <trk>
    <name>Morning Ride</name>
    <trkseg>
      <trkpt lat="52.5200" lon="13.4050"><ele>34</ele></trkpt>
      <trkpt lat="52.5210" lon="13.4060"><ele>35</ele></trkpt>
      <trkpt lat="52.5220" lon="13.4070"><ele>33</ele></trkpt>
      <trkpt lat="52.5230" lon="13.4080"><ele>36</ele></trkpt>
      <trkpt lat="52.5240" lon="13.4090"><ele>34</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** Real-world Strava-style GPX (no namespace) */
export const STRAVA_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1"
     xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Evening Ride</name>
    <type>cycling</type>
    <trkseg>
      <trkpt lat="50.0614" lon="19.9383"><ele>219</ele></trkpt>
      <trkpt lat="50.0620" lon="19.9390"><ele>220</ele></trkpt>
      <trkpt lat="50.0625" lon="19.9400"><ele>218</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** Real-world Garmin-style GPX */
export const GARMIN_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     creator="Garmin Connect" version="1.1">
  <trk>
    <name>Garmin Activity</name>
    <trkseg>
      <trkpt lat="48.8566" lon="2.3522"><ele>35</ele></trkpt>
      <trkpt lat="48.8570" lon="2.3530"><ele>36</ele></trkpt>
      <trkpt lat="48.8575" lon="2.3540"><ele>34</ele></trkpt>
      <trkpt lat="48.8580" lon="2.3550"><ele>37</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/** GPX with multiple trkseg elements */
export const MULTI_SEGMENT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <name>Multi-segment Route</name>
    <trkseg>
      <trkpt lat="50.0" lon="20.0"></trkpt>
      <trkpt lat="50.01" lon="20.01"></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="50.02" lon="20.02"></trkpt>
      <trkpt lat="50.03" lon="20.03"></trkpt>
    </trkseg>
  </trk>
</gpx>`;
