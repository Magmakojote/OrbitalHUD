// 1. Karte initialisieren (Standard-Zoom-Buttons ausblenden)
const map = L.map('map', { zoomControl: false }).setView([0, 0], 3);

// Zoom-Buttons unten rechts platzieren
L.control.zoom({ position: 'bottomright' }).addTo(map);

// 2. Basemap (Hintergrundkarte) - CartoDB Dark Matter
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// 3. Tag/Nacht-Grenze (Terminator) initialisieren
const terminator = L.terminator({
    fillOpacity: 0.15, // Transparenz des Schattens
    color: '#000',     // Keine Randlinie
    weight: 0,
    interactive: false // Klicks sollen durch den Schatten hindurchgehen
}).addTo(map);

// 4. Layer Gruppen für ISS und Flugbahn
const issLayer = L.layerGroup().addTo(map);
const pathLayer = L.layerGroup().addTo(map);

// 5. Layer Control (Menü oben rechts)
const overlays = {
    "ISS Station (Live)": issLayer,
    "Flugbahn (Trail)": pathLayer,
    "Tag/Nacht Grenze": terminator
};
L.control.layers(null, overlays, { position: 'topright' }).addTo(map);

// 6. ISS Icon Definition
const issIcon = L.icon({
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/International_Space_Station.svg',
    iconSize: [50, 30],
    iconAnchor: [25, 15],     // Mitte des Icons
    popupAnchor: [0, -10],    // Popup öffnet sich etwas darüber
    className: 'iss-icon-style' // CSS-Glow-Effekt
});

// Globale Variablen für Status
let issMarker = null;
let issPath = null;
let pathCoords = [];

// 7. Hauptfunktion: Daten holen und UI updaten
async function getISSData() {
    const url = 'https://api.wheretheiss.at/v1/satellites/25544?units=kilometers';
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Daten entpacken
        const { latitude, longitude, altitude, velocity, visibility } = data;

        // --- A) DASHBOARD UPDATES ---
        
        // UTC Zeit
        const now = new Date();
        const timeString = now.toISOString().split('T')[1].split('.')[0];
        document.getElementById('utc-time').innerText = timeString + " Z";

        // Sichtbarkeit
        const visSpan = document.getElementById('vis-status');
        if(visibility === "daylight") {
            visSpan.innerText = "Tageslicht";
            visSpan.style.color = "#fbbf24"; // Gelb
        } else {
            visSpan.innerText = "Erdschatten";
            visSpan.style.color = "#94a3b8"; // Grau
        }

        // --- B) MAP UPDATES ---

        // Popup Inhalt generieren
        const popupContent = `
            <div style="min-width: 150px;">
                <h3 style="margin:0 0 10px 0; color:#00ffcc; text-transform:uppercase;">ISS Telemetrie</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 0.85em;">
                    <span style="color:#94a3b8;">Lat:</span> <span>${latitude.toFixed(4)}°</span>
                    <span style="color:#94a3b8;">Lon:</span> <span>${longitude.toFixed(4)}°</span>
                    <span style="color:#94a3b8;">Höhe:</span> <span>${altitude.toFixed(1)} km</span>
                    <span style="color:#94a3b8;">V:</span> <span>${velocity.toFixed(0)} km/h</span>
                </div>
            </div>
        `;

        // Marker Logik
        if (!issMarker) {
            issMarker = L.marker([latitude, longitude], {icon: issIcon}).addTo(issLayer);
            issMarker.bindPopup(popupContent);
        } else {
            issMarker.setLatLng([latitude, longitude]);
            // Popup live updaten, falls offen
            if (issMarker.getPopup().isOpen()) {
                issMarker.setPopupContent(popupContent);
            } else {
                issMarker.bindPopup(popupContent);
            }
        }

        // Flugbahn Logik
        pathCoords.push([latitude, longitude]);
        if (pathCoords.length > 200) pathCoords.shift(); // Max 200 Punkte speichern

        if (!issPath) {
            issPath = L.polyline(pathCoords, { 
                color: '#00ffcc', 
                weight: 3, 
                opacity: 0.6 
            }).addTo(pathLayer);
        } else {
            issPath.setLatLngs(pathCoords);
        }
        
        // Karte zentrieren
        map.panTo([latitude, longitude]);

    } catch (error) {
        console.error("Fehler beim Abrufen der ISS Daten:", error);
    }
}

// 8. Loop starten
// Erster Aufruf sofort
getISSData();

// Intervall alle 2 Sekunden
setInterval(() => {
    // 1. ISS Daten holen
    getISSData();
    
    // 2. Tag/Nacht-Schatten aktualisieren (Erddrehung)
    const t = new Date();
    terminator.setTime(t);
}, 2000);