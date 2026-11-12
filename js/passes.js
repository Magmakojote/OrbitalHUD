/**
 * Ansicht „Überflüge“: Standortwahl, Vorhersageliste, Himmelsdiagramm, Kalenderexport.
 */
import { store } from './store.js';
import { predictPasses } from './orbit.js';
import { searchPlace, reverseGeocode } from './net.js';
import { formatCoord, compass, fmt } from './geo.js';
import { $, $$, esc, toast, fmtTime, fmtDay, fmtDuration, tzLabel, setText, sheet } from './ui.js';
import { mapEngine } from './map.js';

const KIND = {
    visible: { label: 'Sichtbar', cls: 'k-visible' },
    daylight: { label: 'Tageslicht', cls: 'k-day' },
    shadow: { label: 'Erdschatten', cls: 'k-shadow' }
};

let expandedId = null;
let computedFor = null;

export const passesView = {
    init() {
        $('#btn-gps').addEventListener('click', () => this.useGPS());
        $('#btn-loc-edit').addEventListener('click', () => this.showForm(true));
        this.bindSearch();
        $$('.pass-toolbar .seg-btn').forEach(b => b.addEventListener('click', () => {
            store.setSetting('passFilter', b.dataset.filter);
            this.render();
        }));
        $('#pass-list').addEventListener('click', (e) => this.onListClick(e));
        $('#peek-next').addEventListener('click', () => {
            sheet.openTab('passes', 'half');
        });
        $('#pass-banner-close').addEventListener('click', () => mapEngine.setFollow(true));
        store.on('pass-cleared', () => { $('#pass-banner').hidden = true; });
        store.on('location', () => { this.renderLocation(); this.compute(true); });
        store.on('settings', ({ key }) => {
            if (key === 'minElevation') this.compute(true);
            if (key === 'timeZone' || key === 'coordFormat') { this.renderLocation(); this.render(); }
        });
        store.on('map-longpress', (ll) => this.confirmMapLocation(ll));
        this.renderLocation();
    },

    /* ---------- Standort ---------- */

    showForm(show) {
        $('#loc-form').hidden = !show;
        $('#btn-loc-edit').hidden = show || !store.state.location;
        if (show) setTimeout(() => $('#city-input').focus(), 50);
    },

    renderLocation() {
        const loc = store.state.location;
        const fmtMode = store.state.settings.coordFormat;
        $('#loc-current').hidden = !loc;
        $('#passes-wrap').hidden = !loc;
        $('#obs-empty').hidden = !!loc;
        $('#obs-data').hidden = !loc;
        if (loc) {
            setText('loc-label', loc.label);
            setText('loc-coords', `${formatCoord(loc.lat, true, fmtMode, 4)}  ${formatCoord(loc.lon, false, fmtMode, 4)}`);
            setText('obs-name', loc.label);
            this.showForm(false);
        } else {
            setText('obs-name', '');
            this.showForm(true);
            $('#peek-next').hidden = true;
        }
    },

    status(msg) { setText('loc-status', msg); },

    setLocation(lat, lon, label) {
        store.setLocation({ lat: +lat.toFixed(5), lon: +lon.toFixed(5), label });
        $('#city-input').value = '';
        $('#suggestions').hidden = true;
        this.status('');
        toast(`Standort gesetzt: ${label}`, 'ok', 2500);
    },

    useGPS() {
        if (!('geolocation' in navigator)) { this.status('GPS wird von diesem Gerät nicht unterstützt.'); return; }
        this.status('Suche GPS-Position …');
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude: lat, longitude: lon, accuracy } = pos.coords;
            let label = 'Aktueller Standort';
            try { const r = await reverseGeocode(lat, lon, 10); if (r?.place) label = `${r.place}${r.country ? ', ' + r.country : ''}`; } catch { /* egal */ }
            this.setLocation(lat, lon, label);
            if (accuracy > 1000) toast(`GPS-Genauigkeit nur ca. ${fmt(accuracy / 1000, 1)} km`, 'warn');
        }, (err) => {
            this.status(err.code === 1 ? 'GPS-Zugriff verweigert. Bitte Ort manuell suchen.' : 'GPS-Position nicht verfügbar.');
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    },

    bindSearch() {
        const input = $('#city-input');
        const list = $('#suggestions');
        let timer, seq = 0, results = [];
        input.addEventListener('input', () => {
            clearTimeout(timer);
            const q = input.value.trim();
            if (q.length < 3) { list.hidden = true; return; }
            timer = setTimeout(async () => {
                const my = ++seq;
                list.innerHTML = '<li class="sugg-info">Suche …</li>'; list.hidden = false;
                try {
                    results = await searchPlace(q);
                    if (my !== seq) return;
                    list.innerHTML = results.length
                        ? results.map((r, i) => `<li role="option" tabindex="0" data-i="${i}"><b>${esc(r.label)}</b><small>${esc(r.full)}</small></li>`).join('')
                        : '<li class="sugg-info">Keine Treffer</li>';
                } catch {
                    if (my === seq) list.innerHTML = '<li class="sugg-info">Suchdienst gerade nicht erreichbar</li>';
                }
            }, 450);
        });
        const pick = (li) => { const r = results[+li.dataset.i]; if (r) this.setLocation(r.lat, r.lon, r.label); };
        list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) pick(li); });
        list.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const li = e.target.closest('li[data-i]'); if (li) pick(li); } });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { const first = list.querySelector('li[data-i]'); if (first) pick(first); }
            if (e.key === 'ArrowDown') list.querySelector('li[data-i]')?.focus();
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.search')) list.hidden = true; });
    },

    async confirmMapLocation(ll) {
        const lat = ll.lat, lon = ((ll.lng + 540) % 360) - 180;
        const fmtMode = store.state.settings.coordFormat;
        const html = `<div class="popup-loc"><b>Als Standort setzen?</b><br><span class="mono">${formatCoord(lat, true, fmtMode, 4)}<br>${formatCoord(lon, false, fmtMode, 4)}</span><br><button type="button" class="btn primary small" id="popup-set">Übernehmen</button></div>`;
        const popup = window.L.popup({ className: 'hud-popup', autoPan: true }).setLatLng(ll).setContent(html).openOn(mapEngine.map);
        setTimeout(() => {
            document.getElementById('popup-set')?.addEventListener('click', async () => {
                mapEngine.map.closePopup(popup);
                let label = `Punkt ${fmt(lat, 2)}°, ${fmt(lon, 2)}°`;
                try { const r = await reverseGeocode(lat, lon, 10); if (r?.place || r?.country) label = [r.place, r.country].filter(Boolean).join(', '); } catch { /* egal */ }
                this.setLocation(lat, lon, label);
            });
        }, 0);
    },

    /* ---------- Berechnung ---------- */

    compute(force = false) {
        const { satrec, location, settings } = store.state;
        if (!satrec || !location) return;
        const key = `${location.lat},${location.lon},${settings.minElevation}`;
        if (!force && computedFor === key && store.state.passes.length && store.state.passes[0].end.time > Date.now()) return;
        computedFor = key;
        const t0 = performance.now();
        store.state.passes = predictPasses(satrec, location.lat, location.lon, { days: 10, minElevation: settings.minElevation });
        store.state.passesComputedAt = Date.now();
        console.info(`Überflüge berechnet in ${Math.round(performance.now() - t0)} ms`);
        this.render();
    },

    /** Entfernt vergangene Überflüge und aktualisiert Countdown. */
    tick() {
        const p = store.state.passes;
        if (p.length && p[0].end.time < Date.now()) {
            store.state.passes = p.filter(x => x.end.time >= Date.now());
            if (store.state.passes.length < 5) this.compute(true); else this.render();
        }
        this.renderCountdown();
    },

    /* ---------- Darstellung ---------- */

    filtered() {
        const filter = store.state.settings.passFilter;
        return store.state.passes.filter(p => filter === 'all' || p.kind === 'visible');
    },

    render() {
        const filter = store.state.settings.passFilter;
        $$('.pass-toolbar .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
        const list = this.filtered();
        const all = store.state.passes;
        setText('passes-meta', `${all.length} Überflüge · 10 Tage · ${tzLabel()}`);
        const box = $('#pass-list');
        if (!store.state.satrec) { box.innerHTML = '<div class="empty">Warte auf Bahndaten …</div>'; return; }
        if (!list.length) {
            box.innerHTML = `<div class="empty">${filter === 'visible'
                ? 'In den nächsten 10 Tagen ist die ISS von hier aus nicht mit bloßem Auge sichtbar (z. B. wegen heller Sommernächte oder ungünstiger Bahnlage).<br><button type="button" class="chip" data-show-all>Alle Überflüge zeigen</button>'
                : 'Keine Überflüge über der Mindestelevation gefunden.'}</div>`;
            return;
        }
        let lastDay = '';
        box.innerHTML = list.map(p => {
            const day = fmtDay(p.start.time);
            const header = day !== lastDay ? `<div class="day-sep">${esc(day)}</div>` : '';
            lastDay = day;
            return header + this.passCard(p);
        }).join('');
        this.renderCountdown();
    },

    passCard(p) {
        const k = KIND[p.kind];
        const open = expandedId === p.id;
        const s = p.start, e = p.end;
        return `
        <article class="pass ${k.cls} ${open ? 'open' : ''}" data-id="${p.id}">
            <button type="button" class="pass-main" aria-expanded="${open}">
                <div class="pass-time mono">${fmtTime(p.start.time)}<small>${fmtDuration(p.duration)}</small></div>
                <div class="pass-mid">
                    <div class="pass-dir">${compass(s.az)} <span>→</span> ${compass(e.az)}</div>
                    <div class="pass-sub"><span class="kind">${k.label}</span>${p.brightest !== null ? ` · ${fmt(p.brightest, 1)} mag` : ''}</div>
                </div>
                <div class="pass-el"><span class="mono">${Math.round(p.max.el)}°</span><div class="el-bar"><i style="width:${Math.min(100, p.max.el / 90 * 100)}%"></i></div></div>
            </button>
            ${open ? this.passDetail(p) : ''}
        </article>`;
    },

    passDetail(p) {
        const row = (lbl, s) => s ? `<tr><td>${lbl}</td><td class="mono">${fmtTime(s.time, true)}</td><td class="mono">${Math.round(s.az)}° ${compass(s.az)}</td><td class="mono">${Math.round(s.el)}°</td></tr>` : '';
        return `
        <div class="pass-detail">
            ${skyPlot(p)}
            <table class="pass-table">
                <thead><tr><th></th><th>Zeit</th><th>Azimut</th><th>Höhe</th></tr></thead>
                <tbody>${[
                    ['Aufgang', p.start],
                    p.visibleStart && p.visibleStart.time - p.start.time > 15000 ? ['Taucht aus Erdschatten auf', p.visibleStart] : null,
                    ['Höchster Punkt', p.max],
                    p.visibleEnd && p.end.time - p.visibleEnd.time > 15000 ? ['Verschwindet im Erdschatten', p.visibleEnd] : null,
                    ['Untergang', p.end]
                ].filter(Boolean).sort((a, b) => a[1].time - b[1].time).map(([l, s]) => row(l, s)).join('')}</tbody>
            </table>
            <p class="muted small">${passHint(p)}</p>
            <div class="btn-row">
                <button type="button" class="btn primary" data-act="map">Auf Karte zeigen</button>
                <button type="button" class="btn" data-act="ics">Kalender</button>
            </div>
        </div>`;
    },

    onListClick(e) {
        if (e.target.closest('[data-show-all]')) { store.setSetting('passFilter', 'all'); this.render(); return; }
        const art = e.target.closest('.pass');
        if (!art) return;
        const id = +art.dataset.id;
        const p = store.state.passes.find(x => x.id === id);
        if (!p) return;
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'map') { this.showOnMap(p); return; }
        if (act === 'ics') { downloadICS(p, store.state.location); return; }
        if (e.target.closest('.pass-main')) {
            expandedId = expandedId === id ? null : id;
            this.render();
            if (expandedId) document.querySelector(`.pass[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    },

    showOnMap(p) {
        if (!sheet.isDesktop()) sheet.setState('peek');
        setTimeout(() => mapEngine.showPass(p), sheet.isDesktop() ? 0 : 320);
        setText('pass-banner-text', `${fmtDay(p.start.time)}, ${fmtTime(p.start.time)} · max. ${Math.round(p.max.el)}° · ${compass(p.start.az)} → ${compass(p.end.az)}`);
        $('#pass-banner').hidden = false;
    },

    renderCountdown() {
        const chip = $('#peek-next');
        const card = $('#next-visible');
        const now = Date.now();
        const next = store.state.passes.find(p => p.kind === 'visible' && p.end.time > now);
        if (!store.state.location || !next) {
            chip.hidden = !store.state.location;
            if (store.state.location) chip.innerHTML = '<span class="dot k-shadow"></span>Kein sichtbarer Überflug in 10 Tagen';
            card.hidden = true;
            return;
        }
        const s = next.visibleStart || next.start;
        const inProgress = s.time <= now;
        const txt = inProgress ? 'JETZT sichtbar!' : `in ${fmtDuration(s.time - now)}`;
        chip.hidden = false;
        chip.classList.toggle('live', inProgress);
        chip.innerHTML = `<span class="dot k-visible"></span>Nächster sichtbarer Überflug <b>${txt}</b>`;
        card.hidden = false;
        card.innerHTML = `
            <span class="stat-label">Nächster sichtbarer Überflug</span>
            <div class="nv-row">
                <div class="nv-count mono">${inProgress ? 'JETZT' : fmtDuration(s.time - now)}</div>
                <div class="nv-info">${esc(fmtDay(s.time))}, ${fmtTime(s.time)} ${tzLabel() === 'UTC' ? 'UTC' : 'Uhr'}<br>
                Schau nach <b>${compass(s.az)}</b> · max. ${Math.round(next.max.el)}°${next.brightest !== null ? ` · ${fmt(next.brightest, 1)} mag` : ''}</div>
            </div>`;
    }
};

function passHint(p) {
    if (p.kind === 'visible') {
        const s = p.visibleStart, e = p.visibleEnd;
        let t = `Die ISS taucht im ${compass(s.az)} auf`;
        if (p.end.time - e.time > 15000) t += ` und verschwindet im ${compass(e.az)} im Erdschatten`;
        else t += ` und sinkt im ${compass(e.az)} unter den Horizont`;
        return t + '. Sie sieht aus wie ein heller, ruhig wandernder Stern ohne Blinklichter.';
    }
    if (p.kind === 'daylight') return 'Überflug am Taghimmel – mit bloßem Auge nicht zu sehen.';
    return 'Die ISS fliegt im Erdschatten und ist daher nicht beleuchtet.';
}

/** Polares Himmelsdiagramm (Azimut/Elevation) als SVG. */
function skyPlot(p) {
    const R = 100, C = 120;
    const xy = (az, el) => {
        const r = ((90 - el) / 90) * R;
        return [C + r * Math.sin(az * Math.PI / 180), C - r * Math.cos(az * Math.PI / 180)];
    };
    const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    const all = p.samples.map(s => xy(s.az, s.el));
    const segs = [];
    let cur = [];
    p.samples.forEach((s, i) => { if (s.visible) cur.push(all[i]); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    const [sx, sy] = all[0], [ex, ey] = all[all.length - 1];
    const mi = p.samples.indexOf(p.max);
    const [mx, my] = all[mi];
    const ang = Math.atan2(ey - all[all.length - 3][1], ex - all[all.length - 3][0]) * 180 / Math.PI;
    return `
    <svg class="skyplot" viewBox="0 0 240 240" role="img" aria-label="Himmelsdiagramm des Überflugs">
        <circle cx="${C}" cy="${C}" r="${R}" class="sp-horizon"/>
        <circle cx="${C}" cy="${C}" r="${R * 2 / 3}" class="sp-ring"/>
        <circle cx="${C}" cy="${C}" r="${R / 3}" class="sp-ring"/>
        <path d="M${C} ${C - R}V${C + R}M${C - R} ${C}H${C + R}" class="sp-ring"/>
        <text x="${C}" y="${C - R - 6}" class="sp-lbl">N</text><text x="${C + R + 9}" y="${C + 4}" class="sp-lbl">O</text>
        <text x="${C}" y="${C + R + 15}" class="sp-lbl">S</text><text x="${C - R - 9}" y="${C + 4}" class="sp-lbl">W</text>
        <text x="${C + 3}" y="${C - R * 2 / 3 + 11}" class="sp-deg">30°</text><text x="${C + 3}" y="${C - R / 3 + 11}" class="sp-deg">60°</text>
        <path d="${path(all)}" class="sp-path"/>
        ${segs.map(sg => `<path d="${path(sg)}" class="sp-path vis"/>`).join('')}
        <circle cx="${sx}" cy="${sy}" r="4" class="sp-start"/>
        <circle cx="${mx}" cy="${my}" r="3.5" class="sp-max"/>
        <path d="M0 -5 9 0 0 5Z" transform="translate(${ex} ${ey}) rotate(${ang})" class="sp-end"/>
    </svg>`;
}

function downloadICS(p, loc) {
    const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const s = p.visibleStart || p.start, e = p.visibleEnd || p.end;
    const desc = `Aufgang ${Math.round(s.az)}° (${compass(s.az)}), max. ${Math.round(p.max.el)}° Höhe, Untergang ${Math.round(e.az)}° (${compass(e.az)}).`
        + (p.brightest !== null ? ` Helligkeit ca. ${p.brightest.toFixed(1)} mag.` : '') + ' Berechnet mit OrbitalHUD.';
    const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OrbitalHUD//2.0//DE', 'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:iss-${p.id}@orbitalhud`,
        `DTSTAMP:${stamp(Date.now())}`,
        `DTSTART:${stamp(s.time)}`,
        `DTEND:${stamp(e.time)}`,
        `SUMMARY:ISS-Überflug (${KIND[p.kind].label}, max. ${Math.round(p.max.el)}°)`,
        `DESCRIPTION:${desc}`,
        `LOCATION:${(loc?.label || '').replace(/[,;]/g, '\\$&')}`,
        `GEO:${loc?.lat};${loc?.lon}`,
        'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:ISS-Überflug in 10 Minuten', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ISS-Ueberflug-${new Date(s.time).toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
