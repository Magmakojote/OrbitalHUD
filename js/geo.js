/**
 * Geodätische Hilfsfunktionen: Kugelgeometrie, Formatierung, UTM.
 */

export const R_EARTH = 6371.0;          // mittlerer Erdradius [km]
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
export const norm360 = (a) => ((a % 360) + 360) % 360;

/** Zielpunkt auf der Kugel: Start (deg), Azimut (deg), Winkeldistanz (rad). */
export function destination(lat, lon, bearingDeg, angDist) {
    const φ1 = lat * DEG, λ1 = lon * DEG, θ = bearingDeg * DEG;
    const sinφ2 = Math.sin(φ1) * Math.cos(angDist) + Math.cos(φ1) * Math.sin(angDist) * Math.cos(θ);
    const φ2 = Math.asin(clamp(sinφ2, -1, 1));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(angDist) * Math.cos(φ1), Math.cos(angDist) - Math.sin(φ1) * sinφ2);
    return [φ2 / DEG, λ2 / DEG];
}

/** Großkreisdistanz in km (Haversine). */
export function haversine(lat1, lon1, lat2, lon2) {
    const dφ = (lat2 - lat1) * DEG, dλ = (lon2 - lon1) * DEG;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Anfangsazimut (deg) von Punkt 1 zu Punkt 2. */
export function bearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * DEG, φ2 = lat2 * DEG, dλ = (lon2 - lon1) * DEG;
    const y = Math.sin(dλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
    return norm360(Math.atan2(y, x) / DEG);
}

/**
 * Kugelkappe (Kleinkreis) als Leaflet-Polygon-Ringe – inkl. Polabdeckung und
 * Kopien über die Datumsgrenze, damit die Fläche beim Weltumlauf sichtbar bleibt.
 * @returns {Array} Array von Ringen ([lat, lon]-Arrays)
 */
export function capRings(centerLat, centerLon, radiusRad, steps = 180) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const [la, lo] = destination(centerLat, centerLon, (i / steps) * 360, radiusRad);
        // relativ zum Zentrum entfalten
        let d = lo - centerLon;
        d = ((d + 540) % 360) - 180;
        pts.push([la, centerLon + d]);
    }
    const radiusDeg = radiusRad / DEG;
    const containsPole = radiusDeg > 90 - Math.abs(centerLat);
    const offsets = [-360, 0, 360];

    if (!containsPole) {
        return offsets.map(o => pts.map(([a, b]) => [a, b + o]));
    }
    // Kappe enthält einen Pol: Rand als Funktion der Länge sortieren und zum Pol schließen
    const poleLat = centerLat >= 0 ? 85.05 : -85.05;
    pts.sort((p, q) => p[1] - q[1]);
    const line = [];
    for (const o of offsets) for (const [a, b] of pts) line.push([a, b + o]);
    line.push([poleLat, line[line.length - 1][1]], [poleLat, line[0][1]]);
    return [line];
}

/** Zerlegt eine Polyline mit Längen-Sprüngen in eine entfaltete Linie (kontinuierliche Länge). */
export function unwrapTrack(coords) {
    if (!coords.length) return [];
    const out = [[coords[0][0], coords[0][1]]];
    let offset = 0;
    for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1][1], cur = coords[i][1];
        if (cur - prev > 180) offset -= 360;
        else if (prev - cur > 180) offset += 360;
        out.push([coords[i][0], cur + offset]);
    }
    return out;
}

/** Erzeugt Kopien einer entfalteten Linie, verschoben um ±360°. */
export function worldCopies(line, shifts = [-360, 0, 360]) {
    return shifts.map(s => line.map(([a, b]) => [a, b + s]));
}

/* ---------- Formatierung ---------- */

const nf = (d) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = [0, 1, 2, 3, 4, 5].map(nf);
export const fmt = (v, d = 0) => (Number.isFinite(v) ? NF[d].format(v) : '--');

export function toDMS(value, isLat) {
    const hemi = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'O' : 'W');
    const a = Math.abs(value);
    let d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m++; }
    if (m === 60) { m = 0; d++; }
    return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″ ${hemi}`;
}

export function formatCoord(value, isLat, mode = 'dd', digits = 3) {
    if (!Number.isFinite(value)) return '--';
    if (mode === 'dms') return toDMS(value, isLat);
    const hemi = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'O' : 'W');
    return `${fmt(Math.abs(value), digits)}° ${hemi}`;
}

const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => COMPASS[Math.round(norm360(deg) / 22.5) % 16];

/* ---------- UTM (Krüger-Reihen, WGS84) ---------- */

export function toUTM(lat, lon) {
    if (lat < -80 || lat > 84) return null;
    let zone = Math.floor((lon + 180) / 6) + 1;
    // Sonderzonen Norwegen / Spitzbergen
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
    if (lat >= 72 && lat < 84) {
        if (lon >= 0 && lon < 9) zone = 31; else if (lon >= 9 && lon < 21) zone = 33;
        else if (lon >= 21 && lon < 33) zone = 35; else if (lon >= 33 && lon < 42) zone = 37;
    }
    const bands = 'CDEFGHJKLMNPQRSTUVWXX';
    const band = bands[Math.floor((lat + 80) / 8)];

    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const n = f / (2 - f);
    const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
    const α = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
    const λ0 = ((zone - 1) * 6 - 180 + 3) * DEG;
    const φ = lat * DEG, λ = lon * DEG - λ0;
    const e = Math.sqrt(f * (2 - f));
    const t = Math.sinh(Math.atanh(Math.sin(φ)) - e * Math.atanh(e * Math.sin(φ)));
    const ξp = Math.atan2(t, Math.cos(λ));
    const ηp = Math.atanh(Math.sin(λ) / Math.sqrt(1 + t * t));
    let ξ = ξp, η = ηp;
    for (let j = 1; j <= 3; j++) {
        ξ += α[j - 1] * Math.sin(2 * j * ξp) * Math.cosh(2 * j * ηp);
        η += α[j - 1] * Math.cos(2 * j * ξp) * Math.sinh(2 * j * ηp);
    }
    const E = 500000 + k0 * A * η;
    let N = k0 * A * ξ;
    if (lat < 0) N += 10000000;
    return { zone, band, E, N };
}

export function formatUTM(lat, lon) {
    const u = toUTM(lat, lon);
    if (!u) return 'außerhalb UTM';
    return `${u.zone}${u.band} ${Math.round(u.E).toString().padStart(6, '0')} ${Math.round(u.N).toString().padStart(7, '0')}`;
}

/* ---------- Grobe Ozean-Zuordnung (Fallback, wenn kein Land getroffen wird) ---------- */

export function oceanName(lat, lon) {
    if (lat <= -60) return 'Südlicher Ozean';
    if (lat >= 66) return 'Arktischer Ozean';
    if (lat > 30 && lat < 46 && lon > -6 && lon < 36) return 'Mittelmeer';
    if (lon >= -70 && lon < 20) return 'Atlantischer Ozean';
    if (lon >= -100 && lon < -70 && lat > 8) return 'Atlantischer Ozean';
    if (lon >= 20 && lon < 120 && lat < 25 && !(lon > 100 && lat > -8)) return 'Indischer Ozean';
    return 'Pazifischer Ozean';
}
