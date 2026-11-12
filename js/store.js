/**
 * Persistenter Zustand (localStorage, abgesichert gegen Privatmodus/Quota).
 */
const PREFIX = 'orbitalhud:';

export const storage = {
    get(key, fallback = null) {
        try {
            const raw = localStorage.getItem(PREFIX + key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignorieren */ }
    },
    remove(key) {
        try { localStorage.removeItem(PREFIX + key); } catch { /* ignorieren */ }
    }
};

const DEFAULT_SETTINGS = {
    coordFormat: 'dd',
    timeZone: 'local',
    minElevation: 10,
    baseLayer: 'dark',
    overlays: { night: true, track: true, footprint: true, viewshed: true, graticule: false },
    passFilter: 'visible',
    clockUtc: true
};

/** Kleiner reaktiver Store mit Abonnenten. */
function createStore() {
    const saved = storage.get('settings', {});
    const state = {
        settings: { ...DEFAULT_SETTINGS, ...saved, overlays: { ...DEFAULT_SETTINGS.overlays, ...(saved.overlays || {}) } },
        location: storage.get('location', null),
        tle: null,
        satrec: null,
        passes: [],
        online: navigator.onLine
    };
    const listeners = new Map();

    return {
        state,
        on(evt, fn) {
            if (!listeners.has(evt)) listeners.set(evt, new Set());
            listeners.get(evt).add(fn);
            return () => listeners.get(evt).delete(fn);
        },
        emit(evt, payload) {
            listeners.get(evt)?.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
        },
        setSetting(key, value) {
            state.settings[key] = value;
            storage.set('settings', state.settings);
            this.emit('settings', { key, value });
        },
        setOverlay(key, value) {
            state.settings.overlays[key] = value;
            storage.set('settings', state.settings);
            this.emit('overlay', { key, value });
        },
        setLocation(loc) {
            state.location = loc;
            if (loc) storage.set('location', loc); else storage.remove('location');
            this.emit('location', loc);
        }
    };
}

export const store = createStore();
