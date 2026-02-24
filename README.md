# 🛰️ OrbitalHUD | International Space Station Tracker

-> Github Pages Link zur Webseite: https://magmakojote.github.io/OrbitalHUD/

Ein interaktiver Echtzeit-Tracker für die Internationale Raumstation (ISS) im futuristischen Heads-Up-Display (HUD) Design. Dieses Projekt visualisiert Telemetriedaten, berechnet orbitale Pfade und integriert aktuelle Nachrichten der NASA.

## 🚀 Features

* **Echtzeit-Tracking:** Live-Positionsupdates der ISS alle 2 Sekunden über die `WhereTheISS`-API.
* **Orbitale Vorhersage:** Berechnung und Visualisierung der Flugbahn für die nächsten 30 Minuten mittels `satellite.js` und TLE-Daten.
* **Sighting Setup:** Benutzer können ihren Standort via GPS oder manueller Suche (Nominatim API) festlegen, um den nächsten sichtbaren Überflug zu berechnen.
* **NASA News Feed:** Integration des offiziellen ISS-Blogs via RSS-zu-JSON-Konvertierung mit Skeleton-Loading-Screens für optimierte UX.
* **Futuristisches UI:** Vollständig responsives HUD-Design mit Dark-Mode-Optimierung, Glasmorphismus-Effekten und dynamischen HUD-Toasts für Systemmeldungen.
* **Tag/Nacht-Visualisierung:** Dynamische Anzeige des Erdschattens (Terminator) auf der Karte.

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Modern Flexbox/Grid, Animations)
* **JavaScript:** Vanilla JS (ES6+), Asynchrones Programmieren (Async/Await)
* **Karten-Engine:** [Leaflet.js](https://leafletjs.com/)
* **Mathematik-Bibliotheken:** [satellite.js](https://github.com/shashwatak/satellite-js) für SGP4/SDP4 Berechnungen.
* **APIs:**
    * `wheretheiss.at` (Telemetrie & TLE)
    * `openstreetmap.org` (Geocoding)
    * `nasa.gov` (News RSS)

## 📦 Installation & Nutzung

Da es sich um eine reine Client-seitige Anwendung handelt, ist keine komplexe Installation erforderlich:

1. Repository klonen:
   ```bash
   git clone [https://github.com/magmakojote/OrbitalHUD.git](https://github.com/magmakojote/OrbitalHUD.git)
