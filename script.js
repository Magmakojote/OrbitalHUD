/* --- UTILS --- */

/**
 * Standardisierte Fetch-Funktion mit Retry-Logik für instabile Netzwerke.
 */
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw err;
    }
}

/* --- JS MODULES --- */

/**
 * Globaler Datenspeicher für historische Fakten und dynamische Inhalte.
 */
const APP_DATA = {
    historical: { "0-1": "Neujahr auf der ISS", "0-25": "1984: Projektstart ISS", "0-29": "1998: Rahmenabkommen unterzeichnet", "1-1": "2003: Gedenken Columbia", "1-7": "2008: Start Columbus", "1-12": "2001: Start Destiny", "3-12": "1961: Juri Gagarin im All", "10-2": "2000: Ankunft Exp. 1", "10-20": "1998: Start Zarya" },
    stats: [ "7,66 km/s Orbitalgeschwindigkeit", "25 Jahre bemannte Präsenz", "Über 290 Besucher aus 26 Ländern", "4.36 Mrd. Meilen zurückgelegt", "Über 4.000 wissenschaftliche Experimente", "20.100 Tortillas konsumiert" ],
    news: [],
    userLocation: null
};

/**
 * Kernkomponente für die Karten-Steuerung und orbitale Mechanik.
 */
const MAP_ENGINE = {
    map: null,
    issMarker: null,
    footprintCircle: null,
    historyPath: null,
    predictionGroup: null,
    terminator: null,
    historyCoords: [[]],
    followMode: true,
    currentPathColor: '#00ffcc',
    tleData: null,

    /**
     * Initialisiert die Karte und begrenzt den Zoom für bessere Orientierung.
     */
    init() {
        const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
        const satMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
        const lightMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });

        this.map = L.map('map', { 
            zoomControl: false, 
            layers: [darkMap], 
            minZoom: 4, 
            worldCopyJump: true 
        }).setView([20, 0], 4);

        L.control.zoom({ position: 'topleft' }).addTo(this.map);
        L.control.layers({ "Dark Mode": darkMap, "Satellit": satMap, "Karte (Hell)": lightMap }, null, { position: 'topright' }).addTo(this.map);

        this.terminator = L.terminator({ fillOpacity: 0.15, color: '#000', weight: 0 }).addTo(this.map);
        this.predictionGroup = L.featureGroup().addTo(this.map);
        
        this.map.on('baselayerchange', (e) => this.handleThemeChange(e));
        this.map.on('dragstart', () => { this.followMode = false; UI_CONTROLLER.updateTrackingBtn(); });
    },

    /**
     * Wechselt visuelle Parameter passend zum Karten-Hintergrund.
     */
    handleThemeChange(e) {
        const mapDiv = document.getElementById('map');
        mapDiv.classList.remove('theme-dark', 'theme-light', 'theme-sat');
        if (e.name === "Karte (Hell)") { 
            mapDiv.classList.add('theme-light'); 
            this.currentPathColor = '#2563eb'; 
            this.terminator.setStyle({ fillOpacity: 0.4 }); 
        } 
        else if (e.name === "Satellit") { 
            mapDiv.classList.add('theme-sat'); 
            this.currentPathColor = '#ffffff'; 
            this.terminator.setStyle({ fillOpacity: 0.5 }); 
        } 
        else { 
            mapDiv.classList.add('theme-dark'); 
            this.currentPathColor = '#00ffcc'; 
            this.terminator.setStyle({ fillOpacity: 0.15 }); 
        }
        if (this.historyPath) this.historyPath.setStyle({ color: this.currentPathColor });
        if (this.footprintCircle) this.footprintCircle.setStyle({ color: this.currentPathColor });
        this.updateOrbit();
    },

    toggleFollow() { this.followMode = !this.followMode; UI_CONTROLLER.updateTrackingBtn(); if(this.followMode) ISS_DATA.fetch(); },

    /**
     * Zeichnet die aktuelle ISS Position und berechnet Pfadsegmente über die Datumsgrenze hinweg.
     */
    updateISS(lat, lon, altitude, velKms, visibility) {
        const radiusKm = 1600; 
        const icon = L.icon({
            iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/International_Space_Station.svg',
            iconSize: [50, 30], iconAnchor: [25, 15], popupAnchor: [0, -10], className: 'iss-icon-style'
        });

        const popupHtml = `<div style="min-width: 160px;"><h3 style="margin:0 0 10px 0; color:#00ffcc; text-transform:uppercase; font-size:12px;">ISS Telemetrie</h3><div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 11px;"><span>Lat/Lon:</span> <span>${lat.toFixed(2)}/${lon.toFixed(2)}</span><span>Höhe:</span> <span>${altitude.toFixed(1)} km</span><span>Geschw.:</span> <span>${velKms} km/s</span></div><hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:10px 0;"><a href="https://www.nasa.gov/station" target="_blank" style="color:#00ffcc; text-decoration:none; display:block; text-align:center; font-weight:bold;">&rarr; NASA Page</a></div>`;

        if (!this.issMarker) {
            this.issMarker = L.marker([lat, lon], {icon}).addTo(this.map).bindPopup(popupHtml);
            this.footprintCircle = L.circle([lat, lon], { radius: radiusKm * 1000, color: this.currentPathColor, weight: 1, fillOpacity: 0.05, dashArray: '5, 5', interactive: false }).addTo(this.map);
        } else {
            this.issMarker.setLatLng([lat, lon]).setPopupContent(popupHtml);
            this.footprintCircle.setLatLng([lat, lon]).setRadius(radiusKm * 1000);
        }

        let currentSeg = this.historyCoords[this.historyCoords.length - 1];
        if (currentSeg.length > 0 && Math.abs(lon - currentSeg[currentSeg.length-1][1]) > 180) { this.historyCoords.push([]); currentSeg = this.historyCoords[this.historyCoords.length - 1]; }
        currentSeg.push([lat, lon]);
        if (this.historyCoords.flat().length > 500) this.historyCoords[0].shift();
        if (!this.historyPath) this.historyPath = L.polyline(this.historyCoords, { color: this.currentPathColor, weight: 3, opacity: 0.8 }).addTo(this.map);
        else this.historyPath.setLatLngs(this.historyCoords);

        if (this.followMode) this.map.panTo([lat, lon]);
        this.updateOrbit();
    },

    /**
     * Nutzt satellite.js für eine 30-minütige Pfad-Vorhersage basierend auf TLE-Daten.
     */
    updateOrbit() {
        if (!this.tleData) return;
        this.predictionGroup.clearLayers();
        const satrec = satellite.twoline2satrec(this.tleData.line1, this.tleData.line2);
        const now = new Date();
        const points = [];
        for (let i = 0; i <= 30; i += 2) {
            const futureTime = new Date(now.getTime() + i * 60000);
            const posVel = satellite.propagate(satrec, futureTime);
            const posGd = satellite.eciToGeodetic(posVel.position, satellite.gstime(futureTime));
            points.push([satellite.degreesLat(posGd.latitude), satellite.degreesLong(posGd.longitude)]);
        }
        for (let j = 0; j < points.length - 1; j++) {
            if (Math.abs(points[j][1] - points[j+1][1]) > 180) continue;
            L.polyline([points[j], points[j+1]], { color: this.currentPathColor, weight: 2, opacity: 0.6 * (1 - (j / points.length)), dashArray: '5, 8' }).addTo(this.predictionGroup);
        }
    }
};

/**
 * Modul für Datenabrufe von NASA und Telemetrie-Providern.
 */
const ISS_DATA = {
    async fetch() {
        try {
            const data = await fetchWithRetry('https://api.wheretheiss.at/v1/satellites/25544?units=kilometers');
            const velKms = (data.velocity / 3600).toFixed(2);
            UI_CONTROLLER.updateTelemetry(velKms, data.visibility);
            MAP_ENGINE.updateISS(data.latitude, data.longitude, data.altitude, velKms, data.visibility);
            if(APP_DATA.userLocation) this.calculateNextPass();
        } catch (e) { UI_CONTROLLER.showToast("Telemetrie-Fehler: Server nicht erreichbar."); }
    },

    async fetchTLE() {
        try {
            MAP_ENGINE.tleData = await fetchWithRetry('https://api.wheretheiss.at/v1/satellites/25544/tles');
        } catch (e) { UI_CONTROLLER.showToast("Bahndaten-Stream unterbrochen."); }
    },

    async fetchNews() {
        const rssUrl = 'https://www.nasa.gov/blogs/spacestation/feed/';
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        try {
            const data = await fetchWithRetry(proxyUrl);
            if (data.status === 'ok') {
                APP_DATA.news = data.items.slice(0, 5).map(item => {
                    let thumb = null;
                    if (item.enclosure && item.enclosure.link) thumb = item.enclosure.link;
                    else if (item.thumbnail) thumb = item.thumbnail;
                    else {
                        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/i);
                        if (imgMatch) thumb = imgMatch[1];
                    }
                    return {
                        title: item.title,
                        date: new Date(item.pubDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }),
                        content: item.description.replace(/<[^>]*>?/gm, '').substring(0, 160).trim() + '...',
                        link: item.link,
                        image: thumb
                    };
                });
            } else { throw new Error(); }
        } catch (e) { UI_CONTROLLER.showToast("Newsfeed konnte nicht geladen werden."); APP_DATA.news = []; }
    },

    calculateNextPass() {
        if (!MAP_ENGINE.tleData || !APP_DATA.userLocation) return;
        const satrec = satellite.twoline2satrec(MAP_ENGINE.tleData.line1, MAP_ENGINE.tleData.line2);
        const now = new Date();
        const obsPos = { latitude: satellite.degreesToRadians(APP_DATA.userLocation.lat), longitude: satellite.degreesToRadians(APP_DATA.userLocation.lon), height: 0 };
        let foundPassTime = null;
        for (let m = 0; m < 1440; m++) { 
            const checkTime = new Date(now.getTime() + m * 60000);
            const posVel = satellite.propagate(satrec, checkTime);
            if (!posVel.position) continue;
            const lookAngles = satellite.ecfToLookAngles(obsPos, satellite.eciToEcf(posVel.position, satellite.gstime(checkTime)));
            if (lookAngles.elevation > 0) { foundPassTime = m; break; }
        }
        UI_CONTROLLER.updatePassDisplay(foundPassTime);
    }
};

/**
 * Controller für UI-Elemente, Overlays und HUD-Komponenten.
 */
const UI_CONTROLLER = {
    statsIndex: 0,
    searchTimer: null,

    init() {
        const cityInput = document.getElementById('city-input');
        cityInput.addEventListener('input', () => this.handleCitySearch());
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) document.getElementById('suggestions').style.display = 'none';
        });
    },

    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'hud-toast';
        toast.innerHTML = `⚠️ ${message}<br><span style="font-size:0.6rem; opacity:0.7">Versuche Reconnect...</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 400); }, 5000);
    },

    async toggleOverlay(id) {
        const overlay = document.getElementById(id);
        const isOpen = overlay.style.display === 'flex';
        overlay.style.display = isOpen ? 'none' : 'flex';
        if(id === 'news-overlay' && !isOpen) { this.renderSkeleton(); await ISS_DATA.fetchNews(); this.renderNews(); }
    },

    renderSkeleton() {
        const container = document.getElementById('news-container');
        let html = '';
        for(let i=0; i<3; i++) { html += `<div class="news-item"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-img"></div><div class="skeleton skeleton-date"></div><div class="skeleton skeleton-text"></div></div>`; }
        container.innerHTML = html;
    },

    renderNews() {
        const container = document.getElementById('news-container');
        if (!APP_DATA.news.length) { container.innerHTML = '<div style="text-align:center; padding-top: 50px; color:var(--error-color)">Datenstrom-Fehler.</div>'; return; }
        container.innerHTML = APP_DATA.news.map(a => `
            <div class="news-item">
                <h3>${a.title}</h3>
                ${a.image ? `<img src="${a.image}" class="news-thumbnail" onerror="this.style.display='none'" loading="lazy">` : ''}
                <span class="news-date" style="color:var(--text-dim); font-size:0.75rem;">${a.date}</span>
                <p style="line-height:1.6; color:var(--text-main); font-size:0.95rem; margin-bottom:15px;">${a.content}</p>
                <a href="${a.link}" target="_blank" style="color:var(--primary-color); text-decoration:none; font-size:0.8rem; font-weight:bold; letter-spacing:1px; display:inline-block;">[WEITERLESEN]</a>
            </div>
        `).join('');
    },

    showStatus(msg) { document.getElementById('location-status').innerText = msg; },

    async handleCitySearch() {
        const query = document.getElementById('city-input').value;
        const suggestions = document.getElementById('suggestions');
        clearTimeout(this.searchTimer);
        if (query.length < 3) { suggestions.style.display = 'none'; return; }
        this.searchTimer = setTimeout(async () => {
            try {
                const results = await fetchWithRetry(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
                this.renderSuggestions(results);
            } catch (err) { this.showToast("Suchdienst temporär überlastet."); }
        }, 500);
    },

    renderSuggestions(results) {
        const container = document.getElementById('suggestions');
        if (!results.length) { container.style.display = 'none'; return; }
        container.innerHTML = results.map(item => `<div class="suggestion-item" onclick="UI_CONTROLLER.selectLocation(${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}')">${item.display_name}</div>`).join('');
        container.style.display = 'block';
    },

    selectLocation(lat, lon, label) {
        APP_DATA.userLocation = { lat, lon, label };
        document.getElementById('city-input').value = label;
        document.getElementById('suggestions').style.display = 'none';
        this.showStatus("Standort fixiert.");
        document.getElementById('pass-row').style.display = 'flex';
        ISS_DATA.calculateNextPass();
    },

    useGeolocation() {
        this.showStatus("GPS Suche läuft...");
        navigator.geolocation.getCurrentPosition(
            (pos) => this.selectLocation(pos.coords.latitude, pos.coords.longitude, "Aktueller Standort"),
            () => { this.showStatus("Fehler: GPS Zugriff verweigert."); }
        );
    },

    updateTelemetry(velKms, visibility) {
        document.getElementById('utc-time').innerText = new Date().toISOString().split('T')[1].split('.')[0] + " Z";
        const vis = document.getElementById('vis-status');
        vis.innerText = visibility === "daylight" ? "Tageslicht" : "Erdschatten";
        vis.style.color = visibility === "daylight" ? "#fbbf24" : "var(--text-dim)";
    },

    updatePassDisplay(min) {
        const val = document.getElementById('next-pass');
        if (min === null) val.innerText = "> 24h";
        else if (min === 0) val.innerText = "JETZT SICHTBAR";
        else val.innerText = min > 60 ? Math.floor(min/60) + "h " + (min%60) + "m" : min + " min";
        val.style.color = (min === 0) ? "var(--primary-color)" : "white";
    },

    updateTrackingBtn() {
        const btn = document.getElementById('tracking-btn');
        btn.innerText = MAP_ENGINE.followMode ? "● LIVE" : "⏸ LIVE";
        btn.classList.toggle('active', MAP_ENGINE.followMode);
    },

    cycleStats() {
        const now = new Date();
        const dateKey = `${now.getMonth()}-${now.getDate()}`;
        document.getElementById('history-event').innerText = APP_DATA.historical[dateKey] ? `Heute: ${APP_DATA.historical[dateKey]}` : "25 Jahre Forschung im Orbit";
        const ticker = document.getElementById('stats-ticker');
        ticker.style.opacity = 0;
        setTimeout(() => {
            ticker.innerText = APP_DATA.stats[this.statsIndex];
            ticker.style.opacity = 1;
            this.statsIndex = (this.statsIndex + 1) % APP_DATA.stats.length;
        }, 600);
    }
};

// Initialisierungs-Routine
(async function init() {
    MAP_ENGINE.init();
    UI_CONTROLLER.init();
    await ISS_DATA.fetchTLE();
    ISS_DATA.fetch();
    UI_CONTROLLER.cycleStats();
    setInterval(() => { ISS_DATA.fetch(); MAP_ENGINE.terminator.setTime(new Date()); }, 2000);
    setInterval(() => UI_CONTROLLER.cycleStats(), 5000);
    setInterval(() => ISS_DATA.fetchTLE(), 1800000);
})();