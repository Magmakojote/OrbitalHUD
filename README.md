# 🛰️ OrbitalHUD 2.0 | International Space Station Tracker

-> Link zur Webseite: https://magmakojote.github.io/OrbitalHUD/

Ein interaktiver Echtzeit-Tracker für die Internationale Raumstation (ISS) im futuristischen Heads-Up-Display (HUD) Design – entwickelt mit Fokus auf Smartphones und als installierbare Web-App (PWA). Die Karte steht im Mittelpunkt: Bodenspur, Footprint, Tag/Nacht-Grenze mit Dämmerungszonen und dein persönlicher Sichtbereich.

## ✨ Neu in 2.0

| Bereich | 1.x | 2.0 |
|---|---|---|
| **Position** | API-Abfrage alle 2 s | Lokale SGP4-Berechnung aus TLE, sekündlich, funktioniert auch offline |
| **Bodenspur** | 30 min Vorhersage | ±1 kompletter Umlauf, nahtlos über die Datumsgrenze |
| **Tag/Nacht** | Externes Plugin | Eigene Berechnung inkl. bürgerlicher, nautischer & astronomischer Dämmerung + subsolarer Punkt |
| **Überflüge** | Nur „nächster Überflug in X min“ | 10-Tage-Liste mit Auf-/Untergang, Richtung, max. Elevation, Sichtbarkeit (Erdschatten/Dämmerung), Helligkeit in mag, Himmelsdiagramm, Darstellung auf der Karte und Kalender-Export (.ics) |
| **Standort** | GPS oder Suche | GPS, Suche oder **langes Tippen auf die Karte**; wird lokal gespeichert |
| **Geodaten** | Lat/Lon | Dezimal oder DMS, **UTM-Koordinaten**, Kurs, Bodengeschwindigkeit, Footprint-Radius, Azimut/Elevation/Schrägentfernung vom Standort |
| **Bahnelemente** | – | Inklination, Umlaufzeit, Perigäum/Apogäum, Exzentrizität, Umlauf-Nr., nächster Orbit-Sonnenauf-/untergang |
| **Karten** | Dunkel, Satellit, Hell | Dunkel, Satellit (mit Beschriftung), Topografie, Hell + Gradnetz mit Wende-/Polarkreisen, Maßstab |
| **Bedienung** | Overlays | Mobile Bottom-Sheet mit Wischgesten und Tab-Leiste; Seitenpanel am Desktop |
| **App** | – | PWA: installierbar, Offline-Start, Kachel-Cache |
| **Stabilität** | – | Mehrere TLE-Quellen mit Fallback, Caching, Timeouts, XSS-sichere Darstellung der News |

> Hinweis: Die bisher genutzten CARTO-Basiskarten verlangen inzwischen einen API-Key. 2.0 nutzt stattdessen die frei verfügbaren Esri-Canvas-Karten.

## 🚀 Features

* **Echtzeit-Tracking:** ISS-Position lokal per SGP4 (satellite.js) aus aktuellen TLE-Bahndaten berechnet (Abweichung zur Live-API < 1 km).
* **Bodenspur & Footprint:** Vergangener und kommender Umlauf, Sichtbarkeitskreis der ISS (0° Elevation).
* **Tag/Nacht & Dämmerung:** Vier Abstufungen der Nachtseite und der subsolare Punkt.
* **Überflugvorhersage:** Sichtbare Überflüge für deinen Standort inkl. Himmelsdiagramm und Kalenderexport.
* **NASA News Feed:** Offizieller ISS-Blog mit Offline-Cache.
* **Info & Einstellungen:** „Heute in der Geschichte“, ISS-Fakten, Koordinatenformat, Zeitzone, Mindest-Elevation.

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Custom Properties, Grid, Backdrop-Filter), Vanilla JS (ES-Module) – kein Build-Schritt nötig
* **Karten-Engine:** [Leaflet.js](https://leafletjs.com/)
* **Orbitmechanik:** [satellite.js](https://github.com/shashwatak/satellite-js) (SGP4/SDP4), eigene Sonnenstands-, Schatten- und UTM-Berechnung
* **APIs:** CelesTrak / wheretheiss.at / tle.ivanstanojevic.me (TLE), OpenStreetMap Nominatim (Geocoding), NASA ISS Blog (RSS)

## 📁 Projektstruktur

```
index.html              App-Gerüst
manifest.webmanifest    PWA-Manifest
sw.js                   Service Worker (Offline & Kachel-Cache)
css/app.css             Gesamtes Styling (Mobile-first)
js/app.js               Einstieg, Echtzeitschleife, Live-/News-/Info-Ansicht
js/map.js               Leaflet-Karte, Ebenen, Marker, Bodenspur
js/orbit.js             SGP4, Sonne, Erdschatten, Überflugvorhersage
js/passes.js            Überflug-Ansicht, Himmelsdiagramm, .ics-Export
js/geo.js               Kugelgeometrie, Formatierung, UTM
js/net.js               Netzwerk (TLE, Geocoding, News) mit Fallbacks
js/ui.js                Bottom-Sheet, Tabs, Toasts, Zeitformatierung
js/store.js             Einstellungen & Zustand (localStorage)
js/data.js              Historische Ereignisse & Fakten
icons/                  App-Icons
```

## 📦 Installation & Nutzung

Rein clientseitig – kein Build nötig. Wegen ES-Modulen und Service Worker muss die Seite über einen Webserver laufen (nicht per Doppelklick als `file://`):

```bash
git clone https://github.com/magmakojote/OrbitalHUD.git
cd OrbitalHUD
python -m http.server 8000
```

Dann http://localhost:8000 öffnen. Für GitHub Pages einfach den Inhalt ins Repository pushen.

**Bei Updates:** In `sw.js` die Konstante `VERSION` erhöhen, damit installierte Apps die neuen Dateien laden.
