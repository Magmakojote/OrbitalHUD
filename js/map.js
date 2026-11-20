/**
 * Karten-Engine (Leaflet): Basiskarten, Tag/Nacht mit Dämmerungszonen, Bodenspur,
 * Footprint, ISS-Marker, Beobachter mit Sichtbereich und Überflug-Darstellung.
 */
import { store } from './store.js';
import { capRings, unwrapTrack, worldCopies, DEG } from './geo.js';
import { subsolarPoint, groundTrack, footprintAngle } from './orbit.js';

const L = window.L;

// Hinweis: CARTO-Basemaps verlangen inzwischen einen API-Key – daher Esri-Canvas-Karten (frei mit Attribution).
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTR = 'Tiles © <a href="https://www.esri.com">Esri</a>';
const BASE_LAYERS = {
    dark: {
        label: 'Dunkel', theme: 'dark',
        url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
        ref: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
        opts: { maxNativeZoom: 16, attribution: `${ESRI_ATTR} — Esri, HERE, Garmin, © OSM-Mitwirkende` }
    },
    satellite: {
        label: 'Satellit', theme: 'sat',
        url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
        ref: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
        opts: { maxNativeZoom: 18, attribution: `${ESRI_ATTR} — Maxar, Earthstar Geographics, GIS User Community` }
    },
    topo: {
        label: 'Topografie', theme: 'light',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        opts: { subdomains: 'abc', maxNativeZoom: 17, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' }
    },
    light: {
        label: 'Hell', theme: 'light',
        url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
        ref: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
        opts: { maxNativeZoom: 16, attribution: `${ESRI_ATTR} — Esri, HERE, Garmin, © OSM-Mitwirkende` }
    }
};

const THEME_COLORS = {
    dark: { track: '#00ffcc', future: '#00ffcc', foot: '#00ffcc', night: '#000814', nightOpacity: 0.16 },
    sat: { track: '#ffffff', future: '#7dfce4', foot: '#ffffff', night: '#000000', nightOpacity: 0.2 },
    light: { track: '#0f766e', future: '#0d9488', foot: '#0f766e', night: '#0b1120', nightOpacity: 0.12 }
};

const ISS_SVG = `
<svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
  <g class="iss-panels">
    <rect x="3" y="14" width="9" height="15" rx="1"/><rect x="3" y="35" width="9" height="15" rx="1"/>
    <rect x="14" y="14" width="9" height="15" rx="1"/><rect x="14" y="35" width="9" height="15" rx="1"/>
    <rect x="41" y="14" width="9" height="15" rx="1"/><rect x="41" y="35" width="9" height="15" rx="1"/>
    <rect x="52" y="14" width="9" height="15" rx="1"/><rect x="52" y="35" width="9" height="15" rx="1"/>
  </g>
  <rect class="iss-truss" x="3" y="30.5" width="58" height="3" rx="1"/>
  <rect class="iss-body" x="28.5" y="12" width="7" height="40" rx="2.5"/>
  <rect class="iss-body" x="24" y="22" width="16" height="5" rx="2"/>
  <path class="iss-dir" d="M32 2 36 9H28Z"/>
</svg>`;

export const mapEngine = {
    map: null,
    baseLayers: {},
    currentBase: null,
    theme: 'dark',
    follow: true,
    sheetOffset: 0,
    layers: {},
    lastState: null,
    lastTrackAt: 0,

    init() {
        const s = store.state.settings;
        this.map = L.map('map', {
            zoomControl: false,
            worldCopyJump: true,
            minZoom: 2,
            maxZoom: 18,
            attributionControl: true,
            tap: true
        }).setView([30, 10], 3);

        this.map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
        L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 110 }).addTo(this.map);

        for (const [key, def] of Object.entries(BASE_LAYERS)) {
            const common = { maxZoom: 18, updateWhenIdle: true, keepBuffer: 3 };
            const layers = [L.tileLayer(def.url, { ...common, ...def.opts, zIndex: 1 })];
            if (def.ref) layers.push(L.tileLayer(def.ref, { ...common, maxNativeZoom: def.opts.maxNativeZoom, zIndex: 2 }));
            this.baseLayers[key] = L.layerGroup(layers);
        }

        // Eigene Panes für saubere Zeichenreihenfolge
        const pane = (name, z) => { this.map.createPane(name); this.map.getPane(name).style.zIndex = z; this.map.getPane(name).style.pointerEvents = 'none'; };
        pane('night', 350); pane('grid', 360); pane('foot', 380); pane('track', 390); pane('pass', 420);

        this.layers.night = L.layerGroup();
        this.layers.graticule = L.layerGroup();
        this.layers.footprint = L.polygon([], { pane: 'foot', weight: 1.2, dashArray: '4 6', fillOpacity: 0.06, interactive: false });
        this.layers.track = L.layerGroup();
        this.layers.trackPast = L.polyline([], { pane: 'track', weight: 2.5, opacity: 0.9, interactive: false }).addTo(this.layers.track);
        this.layers.trackFuture = L.polyline([], { pane: 'track', weight: 2, opacity: 0.75, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(this.layers.track);
        this.layers.viewshed = L.polygon([], { pane: 'foot', color: '#fbbf24', weight: 1.2, dashArray: '2 5', fillColor: '#fbbf24', fillOpacity: 0.05, interactive: false });
        this.layers.pass = L.layerGroup().addTo(this.map);

        this.issMarker = L.marker([0, 0], {
            icon: L.divIcon({ className: 'iss-marker', html: `<div class="iss-pulse"></div><div class="iss-rot">${ISS_SVG}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
            keyboard: false, zIndexOffset: 1000, title: 'ISS'
        });
        this.issMarker.on('click', () => { this.setFollow(true); store.emit('iss-click'); });

        this.userMarker = L.marker([0, 0], {
            icon: L.divIcon({ className: 'user-marker', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            keyboard: false, title: 'Dein Standort'
        });
        this.losLine = L.polyline([], { pane: 'track', color: '#fbbf24', weight: 1.5, dashArray: '3 5', opacity: 0.9, interactive: false });

        this.setBase(s.baseLayer in BASE_LAYERS ? s.baseLayer : 'dark');
        for (const [k, v] of Object.entries(s.overlays)) this.toggleOverlay(k, v);
        this.buildGraticule();

        this.map.on('dragstart', () => this.setFollow(false));
        this.map.on('contextmenu', (e) => store.emit('map-longpress', e.latlng));
        store.on('location', () => this.updateObserver());
        this.updateObserver();
        this.updateNight();
    },

    /* ---------- Basiskarten & Ebenen ---------- */

    listBases() { return Object.entries(BASE_LAYERS).map(([key, d]) => ({ key, label: d.label })); },

    setBase(key) {
        if (this.currentBase) this.map.removeLayer(this.currentBase);
        this.currentBase = this.baseLayers[key].addTo(this.map);
        this.theme = BASE_LAYERS[key].theme;
        const el = document.getElementById('map');
        el.classList.remove('theme-dark', 'theme-light', 'theme-sat');
        el.classList.add('theme-' + this.theme);
        store.setSetting('baseLayer', key);
        this.applyColors();
    },

    applyColors() {
        const c = THEME_COLORS[this.theme];
        this.layers.trackPast.setStyle({ color: c.track });
        this.layers.trackFuture.setStyle({ color: c.future });
        this.layers.footprint.setStyle({ color: c.foot, fillColor: c.foot });
        this.updateNight(true);
        this.buildGraticule();
    },

    toggleOverlay(key, on) {
        const layer = this.layers[key];
        if (!layer) return;
        if (on) layer.addTo(this.map); else this.map.removeLayer(layer);
        if (key === 'viewshed' && on && !store.state.location) this.map.removeLayer(layer);
    },

    /* ---------- Tag/Nacht ---------- */

    updateNight(force = false) {
        const now = Date.now();
        if (!force && now - (this._nightAt || 0) < 60000) return;
        this._nightAt = now;
        const c = THEME_COLORS[this.theme];
        const ss = subsolarPoint(new Date());
        const anti = { lat: -ss.lat, lon: ss.lon + 180 };
        this.layers.night.clearLayers();
        // Nacht (0°), bürgerlich (−6°), nautisch (−12°), astronomisch (−18°)
        for (const depth of [0, 6, 12, 18]) {
            const rings = capRings(anti.lat, anti.lon, (90 - depth) * DEG, 180);
            L.polygon(rings, { pane: 'night', stroke: false, fillColor: c.night, fillOpacity: c.nightOpacity, interactive: false }).addTo(this.layers.night);
        }
    },

    buildGraticule() {
        const g = this.layers.graticule;
        g.clearLayers();
        const color = this.theme === 'light' ? 'rgba(15,23,42,0.35)' : 'rgba(148,163,184,0.35)';
        const opts = { pane: 'grid', color, weight: 0.8, interactive: false };
        for (let lat = -75; lat <= 75; lat += 15) {
            L.polyline([[lat, -540], [lat, 540]], { ...opts, weight: lat === 0 ? 1.4 : 0.8, dashArray: lat === 0 ? null : '2 4' }).addTo(g);
        }
        for (let lon = -540; lon <= 540; lon += 15) {
            L.polyline([[-85, lon], [85, lon]], { ...opts, weight: lon % 180 === 0 ? 1.4 : 0.8, dashArray: lon % 180 === 0 ? null : '2 4' }).addTo(g);
        }
        // Wendekreise & Polarkreise
        for (const lat of [23.44, -23.44, 66.56, -66.56]) {
            L.polyline([[lat, -540], [lat, 540]], { ...opts, color: 'rgba(251,191,36,0.4)', dashArray: '6 6' }).addTo(g);
        }
    },

    /* ---------- ISS ---------- */

    updateISS(state, motion) {
        this.lastState = state;
        if (!this.map.hasLayer(this.issMarker)) this.issMarker.addTo(this.map);
        // Längengrad an die aktuelle Weltkopie anpassen, damit der Marker nicht springt
        const center = this.map.getCenter().lng;
        const lon = state.lon + Math.round((center - state.lon) / 360) * 360;
        this.issMarker.setLatLng([state.lat, lon]);
        const rot = this.issMarker.getElement()?.querySelector('.iss-rot');
        if (rot) rot.style.transform = `rotate(${motion.heading}deg)`;
        this.issMarker.getElement()?.classList.toggle('in-shadow', !state.sunlit);

        this.layers.footprint.setLatLngs(capRings(state.lat, state.lon, footprintAngle(state.alt, 0), 120));

        if (this.follow) this.centerOn([state.lat, lon], false);
        this.updateLOS();
        this.updateNight();
    },

    /** Bodenspur: −1 Umlauf (Vergangenheit) bis +1 Umlauf (Zukunft). */
    updateTrack(satrec, periodMin, force = false) {
        const now = Date.now();
        if (!force && now - this.lastTrackAt < 20000) return;
        this.lastTrackAt = now;
        const d = new Date(now);
        const past = groundTrack(satrec, new Date(now - periodMin * 60000), d, 30);
        const future = groundTrack(satrec, d, new Date(now + periodMin * 60000), 30);
        const full = unwrapTrack([...past, ...future.slice(1)]);
        const split = past.length - 1;
        // Beide Hälften auf die Länge der aktuellen Position normieren
        const anchor = full[split][1];
        const shift = past[past.length - 1][1] - anchor;
        const fix = full.map(([a, b]) => [a, b + shift]);
        this.layers.trackPast.setLatLngs(worldCopies(fix.slice(0, split + 1)));
        this.layers.trackFuture.setLatLngs(worldCopies(fix.slice(split)));
    },

    /* ---------- Beobachter ---------- */

    updateObserver() {
        const loc = store.state.location;
        if (!loc) {
            this.map.removeLayer(this.userMarker);
            this.map.removeLayer(this.layers.viewshed);
            this.map.removeLayer(this.losLine);
            return;
        }
        this.userMarker.setLatLng([loc.lat, loc.lon]).addTo(this.map);
        // Bereich, in dem die ISS bei typischer Höhe ≥10° über deinem Horizont steht
        const alt = this.lastState?.alt || 420;
        this.layers.viewshed.setLatLngs(capRings(loc.lat, loc.lon, footprintAngle(alt, 10), 120));
        if (store.state.settings.overlays.viewshed) this.layers.viewshed.addTo(this.map);
        this.updateLOS();
    },

    updateLOS() {
        const loc = store.state.location, st = this.lastState;
        if (!loc || !st) return;
        const angle = footprintAngle(st.alt, 0);
        const dist = Math.acos(Math.sin(loc.lat * DEG) * Math.sin(st.lat * DEG) + Math.cos(loc.lat * DEG) * Math.cos(st.lat * DEG) * Math.cos((st.lon - loc.lon) * DEG));
        if (dist < angle) {
            let lon = st.lon;
            while (lon - loc.lon > 180) lon -= 360;
            while (loc.lon - lon > 180) lon += 360;
            this.losLine.setLatLngs([[loc.lat, loc.lon], [st.lat, lon]]);
            if (!this.map.hasLayer(this.losLine)) this.losLine.addTo(this.map);
        } else if (this.map.hasLayer(this.losLine)) {
            this.map.removeLayer(this.losLine);
        }
    },

    /* ---------- Kamera ---------- */

    setSheetOffset(px, side = 0) {
        this.sheetOffset = px;
        this.sideOffset = side;
        document.documentElement.style.setProperty('--map-bottom', px + 'px');
    },

    /** Zentriert so, dass der Punkt mittig im freien (nicht vom Sheet/Panel verdeckten) Bereich liegt. */
    centerOn(latlng, animate = true, zoom) {
        const z = zoom ?? this.map.getZoom();
        const pt = this.map.project(latlng, z).add([-(this.sideOffset || 0) / 2, this.sheetOffset / 2]);
        const target = this.map.unproject(pt, z);
        if (zoom !== undefined) this.map.setView(target, z, { animate });
        else this.map.panTo(target, { animate, duration: 0.8, easeLinearity: 0.5, noMoveStart: true });
    },

    setFollow(on) {
        this.follow = on;
        store.emit('follow', on);
        if (on && this.lastState) {
            this.clearPass();
            this.centerOn([this.lastState.lat, this.lastState.lon], true);
        }
    },

    flyToUser() {
        const loc = store.state.location;
        if (!loc) return false;
        this.setFollow(false);
        this.centerOn([loc.lat, loc.lon], true, Math.max(this.map.getZoom(), 5));
        return true;
    },

    /* ---------- Überflug ---------- */

    showPass(pass) {
        this.layers.pass.clearLayers();
        this.setFollow(false);
        const c = '#fbbf24';
        const line = unwrapTrack(pass.samples.map(s => [s.lat, s.lon]));
        L.polyline(line, { pane: 'pass', color: c, weight: 4, opacity: 0.35, interactive: false }).addTo(this.layers.pass);
        // sichtbare Abschnitte hervorheben
        let seg = [];
        pass.samples.forEach((s, i) => {
            if (s.visible) seg.push(line[i]);
            else if (seg.length) { L.polyline(seg, { pane: 'pass', color: c, weight: 4, interactive: false }).addTo(this.layers.pass); seg = []; }
        });
        if (seg.length) L.polyline(seg, { pane: 'pass', color: c, weight: 4, interactive: false }).addTo(this.layers.pass);
        L.circleMarker(line[0], { pane: 'pass', radius: 5, color: c, fillColor: '#0b1120', fillOpacity: 1, weight: 2 }).bindTooltip('Aufgang').addTo(this.layers.pass);
        L.circleMarker(line[line.length - 1], { pane: 'pass', radius: 5, color: c, fillColor: c, fillOpacity: 1, weight: 2 }).bindTooltip('Untergang').addTo(this.layers.pass);
        const loc = store.state.location;
        const bounds = L.latLngBounds(line);
        if (loc) bounds.extend([loc.lat, loc.lon]);
        this.map.fitBounds(bounds, { paddingTopLeft: [30 + (this.sideOffset || 0), 90], paddingBottomRight: [70, this.sheetOffset + 30], maxZoom: 6 });
    },

    clearPass() { this.layers.pass.clearLayers(); store.emit('pass-cleared'); }
};
