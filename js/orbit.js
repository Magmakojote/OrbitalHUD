/**
 * Orbitmechanik: SGP4-Propagation (satellite.js), Sonnenstand, Erdschatten,
 * Bodenspur und Überflugvorhersage.
 */
import { R_EARTH, DEG, normLon, bearing, haversine } from './geo.js';

const sat = () => window.satellite;
const AU = 149597870.7;
const MU = 398600.4418; // km³/s²

/* ---------------- TLE ---------------- */

export function parseTLE(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const l1 = lines.find(l => l.startsWith('1 '));
    const l2 = lines.find(l => l.startsWith('2 '));
    if (!l1 || !l2) throw new Error('Ungültige TLE');
    return { line1: l1, line2: l2 };
}

export function createSatrec(tle) {
    const rec = sat().twoline2satrec(tle.line1, tle.line2);
    if (rec.error) throw new Error('TLE-Fehler ' + rec.error);
    return rec;
}

/** Epoche der TLE als Date. */
export function tleEpoch(satrec) {
    return new Date((satrec.jdsatepoch - 2440587.5) * 86400000);
}

/** Abgeleitete Bahnelemente aus satrec + TLE-Zeile 2. */
export function orbitalElements(satrec, tle) {
    const nRadMin = satrec.no;                       // rad/min
    const periodMin = (2 * Math.PI) / nRadMin;
    const nRadS = nRadMin / 60;
    const a = Math.cbrt(MU / (nRadS * nRadS));       // große Halbachse km
    const e = satrec.ecco;
    const revAtEpoch = parseInt(tle.line2.substring(63, 68), 10) || 0;
    const epoch = tleEpoch(satrec);
    const revNow = revAtEpoch + Math.floor((Date.now() - epoch.getTime()) / 60000 / periodMin);
    return {
        inclination: satrec.inclo / DEG,
        periodMin,
        revsPerDay: 1440 / periodMin,
        perigee: a * (1 - e) - R_EARTH,
        apogee: a * (1 + e) - R_EARTH,
        eccentricity: e,
        revNumber: revNow,
        epoch
    };
}

/* ---------------- Sonne ---------------- */

/** Sonnenposition (niedrige Genauigkeit, ~0,01°) im ECI-System. */
export function sunPosition(date) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
    const λ = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
    const ε = (23.439 - 0.0000004 * n) * DEG;
    const r = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU;
    const ra = Math.atan2(Math.cos(ε) * Math.sin(λ), Math.cos(λ));
    const dec = Math.asin(Math.sin(ε) * Math.sin(λ));
    return {
        ra, dec,
        eci: { x: r * Math.cos(λ), y: r * Math.cos(ε) * Math.sin(λ), z: r * Math.sin(ε) * Math.sin(λ) }
    };
}

/** Subsolarer Punkt (deg). */
export function subsolarPoint(date) {
    const s = sunPosition(date);
    const gmst = sat().gstime(date);
    return { lat: s.dec / DEG, lon: normLon((s.ra - gmst) / DEG) };
}

/** Sonnenhöhe (deg) an einem Ort. */
export function sunElevation(date, lat, lon, sun = sunPosition(date), gmst = sat().gstime(date)) {
    const H = gmst + lon * DEG - sun.ra;
    const φ = lat * DEG;
    return Math.asin(Math.sin(φ) * Math.sin(sun.dec) + Math.cos(φ) * Math.cos(sun.dec) * Math.cos(H)) / DEG;
}

/** Liegt ein ECI-Punkt im Sonnenlicht? (zylindrisches Schattenmodell) */
export function isSunlit(eci, sun) {
    const s = sun.eci;
    const sl = Math.hypot(s.x, s.y, s.z);
    const ux = s.x / sl, uy = s.y / sl, uz = s.z / sl;
    const proj = eci.x * ux + eci.y * uy + eci.z * uz;
    if (proj > 0) return true;
    const px = eci.x - proj * ux, py = eci.y - proj * uy, pz = eci.z - proj * uz;
    return Math.hypot(px, py, pz) > R_EARTH;
}

/* ---------------- Propagation ---------------- */

/** Vollständiger Zustand zum Zeitpunkt date. */
export function stateAt(satrec, date) {
    const S = sat();
    const pv = S.propagate(satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gmst = S.gstime(date);
    const gd = S.eciToGeodetic(pv.position, gmst);
    const v = pv.velocity;
    const sun = sunPosition(date);
    return {
        date, gmst,
        eci: pv.position,
        lat: S.degreesLat(gd.latitude),
        lon: S.degreesLong(gd.longitude),
        alt: gd.height,
        speed: Math.hypot(v.x, v.y, v.z),
        sunlit: isSunlit(pv.position, sun),
        sun
    };
}

/** Subsatellitenpunkt (schnell, ohne Zusatzinfos). */
export function subPoint(satrec, date) {
    const S = sat();
    const pv = S.propagate(satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gd = S.eciToGeodetic(pv.position, S.gstime(date));
    return [S.degreesLat(gd.latitude), S.degreesLong(gd.longitude)];
}

/** Bodengeschwindigkeit (km/s) und Kurs (deg) über eine kurze Differenz. */
export function groundMotion(satrec, date) {
    const a = subPoint(satrec, date);
    const b = subPoint(satrec, new Date(date.getTime() + 10000));
    if (!a || !b) return { heading: 0, groundSpeed: 0 };
    return { heading: bearing(a[0], a[1], b[0], b[1]), groundSpeed: haversine(a[0], a[1], b[0], b[1]) / 10 };
}

/** Bodenspur zwischen zwei Zeitpunkten. */
export function groundTrack(satrec, from, to, stepSec = 30) {
    const pts = [];
    for (let t = from.getTime(); t <= to.getTime(); t += stepSec * 1000) {
        const p = subPoint(satrec, new Date(t));
        if (p) pts.push(p);
    }
    return pts;
}

/** Horizont-Winkelradius (rad) des Footprints bei Höhe h und Mindestelevation. */
export function footprintAngle(altKm, minElevDeg = 0) {
    const e = minElevDeg * DEG;
    return Math.acos((R_EARTH * Math.cos(e)) / (R_EARTH + altKm)) - e;
}

/** Zeit bis zum nächsten Wechsel Sonnenlicht ↔ Erdschatten. */
export function nextShadowTransition(satrec, from = new Date()) {
    const start = stateAt(satrec, from);
    if (!start) return null;
    for (let s = 10; s <= 6000; s += 10) {
        const d = new Date(from.getTime() + s * 1000);
        const pv = sat().propagate(satrec, d);
        if (!pv.position) continue;
        if (isSunlit(pv.position, sunPosition(d)) !== start.sunlit) {
            return { date: d, toSunlit: !start.sunlit };
        }
    }
    return null;
}

/* ---------------- Beobachter ---------------- */

export function observerGd(lat, lon, heightKm = 0) {
    return { latitude: lat * DEG, longitude: lon * DEG, height: heightKm };
}

/** Azimut/Elevation/Entfernung vom Beobachter. */
export function lookAt(satrec, date, obs) {
    const S = sat();
    const pv = S.propagate(satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gmst = S.gstime(date);
    const la = S.ecfToLookAngles(obs, S.eciToEcf(pv.position, gmst));
    return { az: la.azimuth / DEG, el: la.elevation / DEG, range: la.rangeSat, eci: pv.position, gmst };
}

/** Geschätzte visuelle Helligkeit (mag), Standardhelligkeit ISS ≈ −1,8 mag bei 1000 km / 90° Phase. */
function magnitude(satEci, obs, gmst, sun, range) {
    const S = sat();
    const obsEci = S.ecfToEci(S.geodeticToEcf(obs), gmst);
    const toSun = { x: sun.eci.x - satEci.x, y: sun.eci.y - satEci.y, z: sun.eci.z - satEci.z };
    const toObs = { x: obsEci.x - satEci.x, y: obsEci.y - satEci.y, z: obsEci.z - satEci.z };
    const dot = toSun.x * toObs.x + toSun.y * toObs.y + toSun.z * toObs.z;
    const β = Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(toSun.x, toSun.y, toSun.z) * Math.hypot(toObs.x, toObs.y, toObs.z)))));
    const phase = Math.sin(β) + (Math.PI - β) * Math.cos(β);
    if (phase <= 0) return null;
    return -1.8 + 5 * Math.log10(range / 1000) - 2.5 * Math.log10(phase);
}

/**
 * Überflugvorhersage.
 * @returns {Array<Pass>} Überflüge mit Start/Max/Ende, Sichtbarkeit und Abtastpunkten.
 */
export function predictPasses(satrec, lat, lon, { start = new Date(), days = 7, minElevation = 10, heightKm = 0 } = {}) {
    const obs = observerGd(lat, lon, heightKm);
    const elAt = (t) => { const l = lookAt(satrec, new Date(t), obs); return l ? l.el : -90; };
    const t0 = start.getTime(), tEnd = t0 + days * 86400000, step = 60000;

    const bisect = (a, b, risingEdge) => {
        for (let i = 0; i < 20 && b - a > 500; i++) {
            const m = (a + b) / 2;
            const above = elAt(m) > 0;
            if (above === risingEdge) b = m; else a = m;
        }
        return (a + b) / 2;
    };

    const passes = [];
    let prevT = t0, prevEl = elAt(t0);
    // Beginnt die Vorhersage mitten in einem Überflug, rückwärts den Start suchen
    if (prevEl > 0) {
        let back = t0;
        while (elAt(back - step) > 0 && t0 - back < 30 * 60000) back -= step;
        prevT = back - step; prevEl = elAt(prevT);
    }

    for (let t = prevT + step; t <= tEnd; t += step) {
        const el = elAt(t);
        if (prevEl <= 0 && el > 0) {
            const aos = bisect(t - step, t, true);
            let u = t;
            while (elAt(u) > 0 && u - aos < 30 * 60000) u += step;
            const los = bisect(u - step, u, false);
            passes.push(buildPass(satrec, obs, aos, los));
            t = u; prevEl = elAt(u);
            continue;
        }
        prevEl = el;
    }
    return passes.filter(p => p.max.el >= minElevation && p.end.time > t0);
}

function buildPass(satrec, obs, aos, los) {
    const S = sat();
    const samples = [];
    const dur = los - aos;
    const n = Math.max(20, Math.min(160, Math.round(dur / 5000)));
    let maxIdx = 0;
    for (let i = 0; i <= n; i++) {
        const t = aos + (dur * i) / n;
        const d = new Date(t);
        const l = lookAt(satrec, d, obs);
        if (!l) continue;
        const sun = sunPosition(d);
        const gd = S.eciToGeodetic(l.eci, l.gmst);
        const sunEl = sunElevation(d, obs.latitude / DEG, obs.longitude / DEG, sun, l.gmst);
        const sunlit = isSunlit(l.eci, sun);
        const s = {
            time: t, az: l.az, el: Math.max(0, l.el), range: l.range,
            lat: S.degreesLat(gd.latitude), lon: S.degreesLong(gd.longitude),
            sunlit, sunEl, visible: sunlit && sunEl < -6 && l.el > 0,
            mag: null
        };
        if (s.visible) s.mag = magnitude(l.eci, obs, l.gmst, sun, l.range);
        samples.push(s);
        if (s.el > samples[maxIdx].el) maxIdx = samples.length - 1;
    }
    const vis = samples.filter(s => s.visible);
    const max = samples[maxIdx];
    const sunElMax = max.sunEl;
    let kind;
    if (vis.length) kind = 'visible';
    else if (sunElMax > -6) kind = 'daylight';
    else kind = 'shadow';
    const mags = vis.map(s => s.mag).filter(Number.isFinite);
    return {
        id: Math.round(aos / 1000),
        start: samples[0], end: samples[samples.length - 1], max,
        duration: dur,
        kind,
        visibleStart: vis[0] || null,
        visibleEnd: vis[vis.length - 1] || null,
        brightest: mags.length ? Math.min(...mags) : null,
        samples
    };
}
