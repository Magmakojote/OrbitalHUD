/**
 * OrbitalHUD 2.0 – Einstiegspunkt.
 * Lädt Bahndaten, startet die Echtzeitschleife und verbindet Karte und Oberfläche.
 */
import { store, storage } from './store.js';
import { loadTLE, loadNews, reverseGeocode } from './net.js';
import { createSatrec, stateAt, groundMotion, orbitalElements, footprintAngle, lookAt, observerGd, nextShadowTransition } from './orbit.js';
import { formatCoord, formatUTM, compass, fmt, haversine, oceanName, R_EARTH } from './geo.js';
import { mapEngine } from './map.js';
import { $, $$, esc, setText, toast, sheet, fmtDuration, fmtTime } from './ui.js';
import { passesView } from './passes.js';
import { todayText, facts } from './data.js';

const VERSION = '2.0.0';

const app = {
    elements: null,
    lastRegionAt: 0,
    lastRegionPos: null,
    eclipse: null,

    async start() {
        mapEngine.init();
        sheet.init({ onChange: ({ visible, side }) => mapEngine.setSheetOffset(visible, side) });
        passesView.init();
        this.bindControls();
        this.renderInfo();
        this.registerSW();

        await this.loadOrbit();
        this.hideSplash();

        // Echtzeitschleife: 1 Hz
        this.tick();
        setInterval(() => this.tick(), 1000);
        setInterval(() => this.loadOrbit({ background: true }), 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(true); });
    },

    /* ---------- Daten ---------- */

    async loadOrbit({ background = false, force = false } = {}) {
        try {
            const res = await loadTLE({ force });
            const changed = !store.state.tle || store.state.tle.line1 !== res.tle.line1;
            store.state.tle = res.tle;
            store.state.tleMeta = res;
            if (changed) {
                store.state.satrec = createSatrec(res.tle);
                store.state.elements = orbitalElements(store.state.satrec, res.tle);
                this.renderElements();
                passesView.compute(true);
                mapEngine.updateTrack(store.state.satrec, store.state.elements.periodMin, true);
                this.eclipse = null;
            }
            if (res.stale) toast('Offline: Nutze gespeicherte Bahndaten – Position kann ungenauer sein.', 'warn', 6000);
            // Cache war frisch genug – trotzdem im Hintergrund aktualisieren, wenn > 1 h alt
            if (res.fromCache && !background && Date.now() - res.fetchedAt > 3600000) this.loadOrbit({ background: true, force: true });
            this.setLive(res.stale ? 'warn' : 'ok');
        } catch (e) {
            console.error(e);
            this.setLive('error');
            if (!background) {
                setText('splash-sub', 'Keine Bahndaten erreichbar. Neuer Versuch …');
                toast('Bahndaten konnten nicht geladen werden. Prüfe deine Verbindung.', 'error', 6000);
                await new Promise(r => setTimeout(r, 5000));
                return this.loadOrbit();
            }
        }
        this.renderDataStatus();
    },

    setLive(state) {
        const dot = $('#live-dot');
        dot.className = 'live-dot ' + state;
        dot.title = { ok: 'Live – Bahndaten aktuell', warn: 'Gespeicherte Bahndaten', error: 'Keine Daten' }[state];
    },

    /* ---------- Echtzeit ---------- */

    tick() {
        this.updateClock();
        const { satrec, elements } = store.state;
        if (!satrec) return;
        const now = new Date();
        const st = stateAt(satrec, now);
        if (!st) return;
        const motion = groundMotion(satrec, now);
        mapEngine.updateISS(st, motion);
        mapEngine.updateTrack(satrec, elements.periodMin);
        this.renderLive(st, motion);
        this.updateRegion(st);
        passesView.tick();
    },

    updateClock() {
        const utc = store.state.settings.clockUtc;
        const now = new Date();
        setText('clock-label', utc ? 'UTC' : 'LOKAL');
        setText('clock-time', now.toLocaleTimeString('de-DE', { timeZone: utc ? 'UTC' : undefined }));
    },

    renderLive(st, motion) {
        const mode = store.state.settings.coordFormat;
        const d = mode === 'dms' ? 0 : 2;
        setText('p-lat', mode === 'dms' ? formatCoord(st.lat, true, 'dms') : formatCoord(st.lat, true, 'dd', d));
        setText('p-lon', mode === 'dms' ? formatCoord(st.lon, false, 'dms') : formatCoord(st.lon, false, 'dd', d));
        setText('p-alt', `${fmt(st.alt, 0)} km`);
        setText('p-vel', `${fmt(st.speed, 2)} km/s`);

        // Nur rendern, was sichtbar ist (Akku schonen)
        if (sheet.state === 'peek' && !sheet.isDesktop()) return;
        if (sheet.tab !== 'live') return;

        const vis = $('#l-vis');
        setText(vis, st.sunlit ? 'Sonnenlicht' : 'Erdschatten');
        vis.className = 'stat-big ' + (st.sunlit ? 'sun' : 'shade');
        setText('l-vis-sub', this.eclipseText());
        setText('l-heading', `${Math.round(motion.heading)}°`);
        setText('l-heading-sub', `Richtung ${compass(motion.heading)}`);
        setText('l-vel', `${fmt(st.speed, 2)} km/s`);
        setText('l-vel-sub', `Boden: ${fmt(motion.groundSpeed, 2)} km/s`);
        setText('l-foot', `${fmt(footprintAngle(st.alt) * R_EARTH, 0)} km`);
        setText('l-coord', `${formatCoord(st.lat, true, mode, 4)}  ${formatCoord(st.lon, false, mode, 4)}`);
        setText('l-utm', formatUTM(st.lat, st.lon));
        setText('l-alt', `${fmt(st.alt, 1)} km`);
        setText('btn-coordfmt', mode === 'dms' ? 'Dezimal' : 'DMS');

        const loc = store.state.location;
        if (loc) {
            const la = lookAt(store.state.satrec, st.date, observerGd(loc.lat, loc.lon));
            if (la) {
                setText('o-az', `${fmt(la.az, 1)}° ${compass(la.az)}`);
                setText('o-el', `${fmt(la.el, 1)}° ${la.el > 0 ? '· über dem Horizont' : '· unter dem Horizont'}`);
                setText('o-range', `${fmt(la.range, 0)} km`);
                setText('o-ground', `${fmt(haversine(loc.lat, loc.lon, st.lat, st.lon), 0)} km`);
                $('#o-el').classList.toggle('accent', la.el > 0);
            }
        }
        this.renderElementsAge();
    },

    eclipseText() {
        const { satrec } = store.state;
        if (!this.eclipse || this.eclipse.date < new Date()) this.eclipse = nextShadowTransition(satrec);
        if (!this.eclipse) return '';
        const rest = fmtDuration(this.eclipse.date - Date.now());
        setText('e-eclipse', `${this.eclipse.toSunlit ? 'Sonnenaufgang' : 'Sonnenuntergang'} in ${rest}`);
        return `${this.eclipse.toSunlit ? 'Orbit-Sonnenaufgang' : 'Orbit-Sonnenuntergang'} in ${rest}`;
    },

    renderElements() {
        const e = store.state.elements;
        if (!e) return;
        setText('e-inc', `${fmt(e.inclination, 2)}°`);
        setText('e-period', `${fmt(e.periodMin, 1)} min`);
        setText('e-revs', fmt(e.revsPerDay, 2));
        setText('e-peri', `${fmt(e.perigee, 0)} / ${fmt(e.apogee, 0)} km`);
        setText('e-ecc', fmt(e.eccentricity, 5));
        setText('e-revnum', fmt(e.revNumber, 0));
        this.renderElementsAge();
    },

    renderElementsAge() {
        const e = store.state.elements;
        if (!e) return;
        const h = (Date.now() - e.epoch.getTime()) / 3600000;
        setText('tle-age', `TLE-Alter: ${h < 48 ? fmt(h, 0) + ' h' : fmt(h / 24, 1) + ' Tage'}`);
    },

    /** Region unter der ISS („Überfliegt …“), sparsam per Reverse-Geocoding. */
    async updateRegion(st) {
        const now = Date.now();
        const ocean = oceanName(st.lat, st.lon);
        if (!this.regionLabel) setText('peek-region', `≈ ${ocean}`);
        if (now - this.lastRegionAt < 30000 || !navigator.onLine) return;
        if (this.lastRegionPos && haversine(st.lat, st.lon, ...this.lastRegionPos) < 150) return;
        this.lastRegionAt = now;
        this.lastRegionPos = [st.lat, st.lon];
        try {
            const r = await reverseGeocode(st.lat, st.lon, 5);
            this.regionLabel = r?.country ? [r.state, r.country].filter(Boolean).join(', ') : `≈ ${ocean}`;
        } catch { this.regionLabel = `≈ ${ocean}`; }
        setText('peek-region', this.regionLabel);
    },

    /* ---------- Bedienelemente ---------- */

    bindControls() {
        // Uhr
        $('#clock').addEventListener('click', () => { store.setSetting('clockUtc', !store.state.settings.clockUtc); this.updateClock(); });

        // Folgen / Standort
        $('#btn-follow').addEventListener('click', () => mapEngine.setFollow(true));
        store.on('follow', (on) => {
            $('#btn-follow').classList.toggle('active', on);
            $('#btn-follow').setAttribute('aria-pressed', on);
        });
        $('#btn-me').addEventListener('click', () => {
            if (!mapEngine.flyToUser()) { sheet.openTab('passes', 'half'); toast('Lege zuerst deinen Standort fest.', 'info', 2500); }
        });
        $('#btn-zoom-in').addEventListener('click', () => mapEngine.map.zoomIn());
        $('#btn-zoom-out').addEventListener('click', () => mapEngine.map.zoomOut());

        // Ebenenmenü
        const menu = $('#layer-menu'), btn = $('#btn-layers');
        const base = $('#base-list');
        base.innerHTML = mapEngine.listBases().map(b => `<button type="button" role="radio" class="seg-item" data-base="${b.key}">${esc(b.label)}</button>`).join('');
        const syncBase = () => $$('#base-list [data-base]').forEach(b => {
            const on = b.dataset.base === store.state.settings.baseLayer;
            b.classList.toggle('active', on); b.setAttribute('aria-checked', on);
        });
        syncBase();
        base.addEventListener('click', (e) => { const b = e.target.closest('[data-base]'); if (b) { mapEngine.setBase(b.dataset.base); syncBase(); } });
        $$('#layer-menu [data-overlay]').forEach(cb => {
            cb.checked = !!store.state.settings.overlays[cb.dataset.overlay];
            cb.addEventListener('change', () => { store.setOverlay(cb.dataset.overlay, cb.checked); mapEngine.toggleOverlay(cb.dataset.overlay, cb.checked); });
        });
        const toggleMenu = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', open); btn.classList.toggle('active', open); };
        btn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
        document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('#layer-menu')) toggleMenu(false); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

        // Koordinatenformat-Schnellumschalter
        $('#btn-coordfmt').addEventListener('click', () => store.setSetting('coordFormat', store.state.settings.coordFormat === 'dms' ? 'dd' : 'dms'));

        // Einstellungen (Segment-Buttons)
        $$('[data-setting]').forEach(group => {
            const key = group.dataset.setting;
            const sync = () => $$('.seg-btn', group).forEach(b => b.classList.toggle('active', String(store.state.settings[key]) === b.dataset.value));
            sync();
            group.addEventListener('click', (e) => {
                const b = e.target.closest('.seg-btn'); if (!b) return;
                const v = key === 'minElevation' ? +b.dataset.value : b.dataset.value;
                store.setSetting(key, v);
                sync();
            });
            store.on('settings', ({ key: k }) => { if (k === key) sync(); });
        });
        store.on('settings', ({ key }) => { if (key === 'coordFormat') this.tick(); });

        $('#btn-loc-clear').addEventListener('click', () => {
            if (!store.state.location) { toast('Es ist kein Standort gespeichert.', 'info', 2000); return; }
            store.setLocation(null); store.state.passes = []; toast('Standort gelöscht.', 'ok', 2000);
        });

        // Tabs mit Inhalten laden
        store.on('tab', (tab) => {
            if (tab === 'news') this.renderNews();
            if (tab === 'live') this.tick();
            if (tab === 'passes') passesView.compute();
        });
        $('#btn-news-reload').addEventListener('click', () => this.renderNews(true));
        store.on('iss-click', () => { if (!sheet.isDesktop()) sheet.openTab('live', 'half'); });

        // Online/Offline
        window.addEventListener('online', () => { toast('Wieder online.', 'ok', 2000); this.loadOrbit({ background: true }); });
        window.addEventListener('offline', () => toast('Offline – Position wird weiter lokal berechnet.', 'warn', 5000));
    },

    /* ---------- News ---------- */

    async renderNews(force = false) {
        const box = $('#news-list');
        if (!force && box.dataset.loaded && !box.dataset.stale) return;
        box.innerHTML = Array.from({ length: 3 }, () => '<div class="news-card skeleton-card"><div class="sk sk-img"></div><div class="sk sk-line w60"></div><div class="sk sk-line"></div><div class="sk sk-line w80"></div></div>').join('');
        try {
            const res = await loadNews({ force });
            box.dataset.loaded = '1';
            box.dataset.stale = res.stale ? '1' : '';
            box.innerHTML = (res.stale ? '<div class="note">Offline – zuletzt gespeicherte Beiträge.</div>' : '') + res.items.map(n => `
                <a class="news-card" href="${esc(n.link)}" target="_blank" rel="noopener">
                    ${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
                    <div class="news-body">
                        <time>${esc(new Date(n.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }))}</time>
                        <h4>${esc(n.title)}</h4>
                        <p>${esc(n.excerpt)}</p>
                        <span class="news-more">Weiterlesen auf nasa.gov →</span>
                    </div>
                </a>`).join('');
        } catch {
            box.dataset.loaded = '';
            box.innerHTML = '<div class="empty">Der NASA-Feed ist gerade nicht erreichbar.<br><button type="button" class="chip" id="news-retry">Erneut versuchen</button></div>';
            $('#news-retry')?.addEventListener('click', () => this.renderNews(true));
        }
    },

    /* ---------- Info ---------- */

    renderInfo() {
        const t = todayText();
        setText('today-label', t.label);
        setText('today-text', t.text);
        const list = facts();
        const dots = $('#fact-dots');
        dots.innerHTML = list.map((_, i) => `<button type="button" aria-label="Fakt ${i + 1}" data-i="${i}"></button>`).join('');
        let i = Math.floor(Math.random() * list.length);
        const show = (n) => {
            i = (n + list.length) % list.length;
            const p = $('#fact-text');
            p.classList.add('fade');
            setTimeout(() => { p.textContent = list[i]; p.classList.remove('fade'); }, 200);
            $$('button', dots).forEach((b, k) => b.classList.toggle('active', k === i));
        };
        show(i);
        dots.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) show(+b.dataset.i); });
        setInterval(() => { if (sheet.tab === 'info' && !document.hidden) show(i + 1); }, 8000);
    },

    renderDataStatus() {
        const m = store.state.tleMeta;
        if (!m) return;
        $('#data-status').innerHTML = `
            <span>TLE-Quelle</span><span>${esc(m.source)}${m.fromCache ? ' (Cache)' : ''}</span>
            <span>Abgerufen</span><span>${new Date(m.fetchedAt).toLocaleString('de-DE')}</span>
            <span>Version</span><span>${VERSION}</span>`;
    },

    hideSplash() {
        const s = $('#splash');
        s.classList.add('hide');
        setTimeout(() => s.remove(), 600);
        if (!storage.get('welcomed')) {
            storage.set('welcomed', true);
            setTimeout(() => toast('Willkommen bei OrbitalHUD 2.0! Wische das Panel nach oben für mehr Details.', 'info', 6000), 800);
        }
    },

    /* ---------- PWA ---------- */

    registerSW() {
        if ('serviceWorker' in navigator && location.protocol !== 'file:') {
            navigator.serviceWorker.register('sw.js').then(reg => {
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    nw?.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update verfügbar – App neu öffnen, um es zu laden.', 'info', 7000);
                    });
                });
            }).catch(err => console.warn('SW nicht registriert', err));
        }
        const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
        if (standalone) return;
        const card = $('#install-card');
        const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (isiOS) {
            card.hidden = false;
            setText('install-text', 'Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“, um OrbitalHUD wie eine App zu nutzen – inklusive Offline-Modus.');
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            card.hidden = false;
            const b = $('#btn-install');
            b.hidden = false;
            b.onclick = async () => { e.prompt(); await e.userChoice; card.hidden = true; };
        });
    }
};

app.start().catch(err => {
    console.error(err);
    setText('splash-sub', 'Fehler beim Start: ' + err.message);
});

// Für Debugging in der Konsole
window.OrbitalHUD = { app, store, mapEngine, fmtTime };
