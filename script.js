// 1. Karte initialisieren
const map = L.map('map', { zoomControl: false }).setView([0, 0], 3);

// Zoom-Buttons oben links
L.control.zoom({ position: 'topleft' }).addTo(map);

// Basemap
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Terminator (Tag/Nacht)
const terminator = L.terminator({
    fillOpacity: 0.15,
    color: '#000',
    weight: 0,
    interactive: false
}).addTo(map);

// Layer Gruppen
const issLayer = L.layerGroup().addTo(map);
const pathLayer = L.layerGroup().addTo(map);

// Layer Control
const overlays = {
    "ISS Station (Live)": issLayer,
    "Flugbahn (Trail)": pathLayer,
    "Tag/Nacht Grenze": terminator
};
L.control.layers(null, overlays, { position: 'topright' }).addTo(map);

// ISS Icon
const issIcon = L.icon({
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/International_Space_Station.svg',
    iconSize: [50, 30],
    iconAnchor: [25, 15],
    popupAnchor: [0, -10],
    className: 'iss-icon-style'
});

// Globale Variablen
let issMarker = null;
let issPath = null;
let pathCoords = [];

// --- NEU: Tracking Logik ---
let followMode = true; // Startet im Verfolgungsmodus
const trackingBtn = document.getElementById('tracking-btn');

// Wenn User die Karte bewegt (Touch oder Maus), Tracking ausschalten
map.on('dragstart', () => {
    followMode = false;
    updateTrackingUI();
});

// Klick auf Button schaltet Tracking wieder ein
trackingBtn.addEventListener('click', () => {
    followMode = true;
    updateTrackingUI();
    getISSData(); // Sofort zentrieren
});

function updateTrackingUI() {
    if (followMode) {
        trackingBtn.classList.add('active');
        trackingBtn.innerText = "● LIVE";
    } else {
        trackingBtn.classList.remove('active');
        trackingBtn.innerText = "⏸ PAUSE";
    }
}

// Hauptfunktion
async function getISSData() {
    const url = 'https://api.wheretheiss.at/v1/satellites/25544?units=kilometers';
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        const { latitude, longitude, altitude, velocity, visibility } = data;

        // UI Updates
        const now = new Date();
        const timeString = now.toISOString().split('T')[1].split('.')[0];
        document.getElementById('utc-time').innerText = timeString + " Z";

        const visSpan = document.getElementById('vis-status');
        if(visibility === "daylight") {
            visSpan.innerText = "Tageslicht";
            visSpan.style.color = "#fbbf24";
        } else {
            visSpan.innerText = "Erdschatten";
            visSpan.style.color = "#94a3b8";
        }

        // Map Updates
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

        if (!issMarker) {
            issMarker = L.marker([latitude, longitude], {icon: issIcon}).addTo(issLayer);
            issMarker.bindPopup(popupContent);
        } else {
            issMarker.setLatLng([latitude, longitude]);
            if (issMarker.getPopup().isOpen()) {
                issMarker.setPopupContent(popupContent);
            } else {
                issMarker.bindPopup(popupContent);
            }
        }

        pathCoords.push([latitude, longitude]);
        if (pathCoords.length > 200) pathCoords.shift();

        if (!issPath) {
            issPath = L.polyline(pathCoords, { color: '#00ffcc', weight: 3, opacity: 0.6 }).addTo(pathLayer);
        } else {
            issPath.setLatLngs(pathCoords);
        }
        
        // --- NEU: Nur pannen, wenn Follow-Mode aktiv ist ---
        if (followMode) {
            map.panTo([latitude, longitude]);
        }

    } catch (error) {
        console.error("Fehler beim Abrufen der ISS Daten:", error);
    }
}

// Loop starten
getISSData();

setInterval(() => {
    getISSData();
    const t = new Date();
    terminator.setTime(t);
}, 2000);