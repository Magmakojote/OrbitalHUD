/**
 * Netzwerkzugriffe: Bahndaten (TLE) mit mehreren Quellen, Geocoding, News.
 */
import { parseTLE } from './orbit.js';
import { storage } from './store.js';

export async function fetchWithTimeout(url, { timeout = 8000, retries = 1, as = 'json', ...opts } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
            const res = await fetch(url, { ...opts, signal: ctrl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return as === 'text' ? await res.text() : await res.json();
        } catch (err) {
            lastErr = err;
            if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

/* ---------------- TLE ---------------- */

const TLE_SOURCES = [
    {
        name: 'CelesTrak',
        load: async () => parseTLE(await fetchWithTimeout('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { as: 'text' }))
    },
    {
        name: 'wheretheiss.at',
        load: async () => {
            const d = await fetchWithTimeout('https://api.wheretheiss.at/v1/satellites/25544/tles');
            return { line1: d.line1, line2: d.line2 };
        }
    },
    {
        name: 'tle.ivanstanojevic.me',
        load: async () => {
            const d = await fetchWithTimeout('https://tle.ivanstanojevic.me/api/tle/25544');
            return { line1: d.line1, line2: d.line2 };
        }
    }
];

const TLE_FRESH_MS = 3 * 3600 * 1000;      // jünger: kein Netzabruf nötig
const TLE_MAX_AGE_MS = 14 * 86400 * 1000;  // älter: unbrauchbar

/** Liefert TLE aus Cache oder Netz. { tle, source, fetchedAt, stale } */
export async function loadTLE({ force = false } = {}) {
    const cached = storage.get('tle');
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (!force && cached && age < TLE_FRESH_MS) return { ...cached, fromCache: true };

    for (const src of TLE_SOURCES) {
        try {
            const tle = await src.load();
            if (!tle.line1 || !tle.line2) continue;
            const entry = { tle, source: src.name, fetchedAt: Date.now() };
            storage.set('tle', entry);
            return entry;
        } catch (e) {
            console.warn('TLE-Quelle fehlgeschlagen:', src.name, e.message);
        }
    }
    if (cached && age < TLE_MAX_AGE_MS) return { ...cached, fromCache: true, stale: true };
    throw new Error('Keine Bahndaten verfügbar');
}

/* ---------------- Geocoding (Nominatim) ---------------- */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchPlace(query) {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=de&q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, { retries: 0 });
    return res.map(r => ({ lat: +r.lat, lon: +r.lon, label: shortLabel(r.display_name), full: r.display_name, type: r.type }));
}

export async function reverseGeocode(lat, lon, zoom = 10) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=${zoom}&accept-language=de&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    const res = await fetchWithTimeout(url, { retries: 0, timeout: 6000 });
    if (res.error) return null;
    const a = res.address || {};
    return {
        country: a.country || null,
        countryCode: a.country_code || null,
        state: a.state || a.region || null,
        place: a.city || a.town || a.village || a.municipality || a.county || null,
        label: shortLabel(res.display_name)
    };
}

function shortLabel(name = '') {
    const parts = name.split(',').map(s => s.trim());
    if (parts.length <= 2) return parts.join(', ');
    return `${parts[0]}, ${parts[parts.length - 1]}`;
}

/* ---------------- News (NASA ISS Blog) ---------------- */

const FEED = 'https://www.nasa.gov/blogs/spacestation/feed/';
const NEWS_TTL = 30 * 60 * 1000;

export async function loadNews({ force = false } = {}) {
    const cached = storage.get('news');
    if (!force && cached && Date.now() - cached.fetchedAt < NEWS_TTL) return cached;
    let items = null;
    try {
        const d = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEED)}`);
        if (d.status !== 'ok') throw new Error('rss2json');
        items = d.items.map(it => ({
            title: it.title,
            link: it.link,
            date: it.pubDate,
            text: it.description || it.content || '',
            image: it.enclosure?.link || it.thumbnail || null
        }));
    } catch {
        try {
            const xml = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(FEED)}`, { as: 'text', retries: 0 });
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            items = [...doc.querySelectorAll('item')].map(it => ({
                title: it.querySelector('title')?.textContent || '',
                link: it.querySelector('link')?.textContent || '',
                date: it.querySelector('pubDate')?.textContent || '',
                text: it.querySelector('description')?.textContent || '',
                image: it.querySelector('enclosure')?.getAttribute('url') || null
            }));
        } catch { /* weiter unten */ }
    }
    if (!items) {
        if (cached) return { ...cached, stale: true };
        throw new Error('News nicht erreichbar');
    }
    items = items.slice(0, 10).map(it => {
        const html = it.text || '';
        const tmp = new DOMParser().parseFromString(html, 'text/html');
        const img = it.image || tmp.querySelector('img')?.getAttribute('src') || null;
        const text = (tmp.body.textContent || '').replace(/\s+/g, ' ').trim();
        return { title: it.title.trim(), link: it.link, date: it.date, image: img, excerpt: text.length > 220 ? text.slice(0, 217).trim() + '…' : text };
    });
    const entry = { items, fetchedAt: Date.now() };
    storage.set('news', entry);
    return entry;
}
