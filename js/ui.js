/**
 * UI-Grundbausteine: Bottom-Sheet mit Gesten, Tabs, Toasts, Zeitformatierung.
 */
import { store } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(str = '') {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function setText(id, text) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el && el.textContent !== text) el.textContent = text;
}

/* ---------------- Zeit ---------------- */

const useUtc = () => store.state.settings.timeZone === 'utc';

export function fmtTime(t, withSec = false) {
    return new Date(t).toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', ...(withSec ? { second: '2-digit' } : {}),
        timeZone: useUtc() ? 'UTC' : undefined
    });
}

export function fmtDay(t) {
    const d = new Date(t);
    const opts = { timeZone: useUtc() ? 'UTC' : undefined };
    const key = (x) => x.toLocaleDateString('de-DE', opts);
    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);
    if (key(d) === key(today)) return 'Heute';
    if (key(d) === key(tomorrow)) return 'Morgen';
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', ...opts });
}

export function fmtDuration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return `${d} T ${h} h`;
    if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
    if (m > 0) return `${m}:${String(sec).padStart(2, '0')} min`;
    return `${sec} s`;
}

export const tzLabel = () => (useUtc() ? 'UTC' : 'Ortszeit');

/* ---------------- Toasts ---------------- */

export function toast(message, type = 'info', ms = 4500) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
}

/* ---------------- Bottom-Sheet ---------------- */

const DESKTOP_MQ = window.matchMedia('(min-width: 900px)');

export const sheet = {
    el: null, state: 'peek', tab: 'live', onChange: null,
    heights: { peek: 0, half: 0, full: 0 },

    init({ onChange }) {
        this.el = document.getElementById('sheet');
        this.body = document.getElementById('sheet-body');
        this.onChange = onChange;
        this.measure();
        window.addEventListener('resize', () => { this.measure(); this.apply(false); });
        DESKTOP_MQ.addEventListener('change', () => { this.measure(); this.apply(false); });
        this.bindDrag();
        // Die erste Karte der aktiven Ansicht bildet die Vorschau (Peek) → bei Größenänderung neu vermessen
        if ('ResizeObserver' in window) {
            const ro = new ResizeObserver(() => {
                const before = this.heights.peek;
                this.measure();
                if (this.heights.peek !== before) this.apply(false);
            });
            $$('.view').forEach(v => ro.observe(v));
        }
        $$('#tabbar .tab').forEach(btn => btn.addEventListener('click', () => this.onTab(btn.dataset.tab)));
        $$('[data-goto]').forEach(btn => btn.addEventListener('click', () => this.openTab(btn.dataset.goto, 'half')));
        this.apply(false);
    },

    isDesktop() { return DESKTOP_MQ.matches; },

    measure() {
        const vh = window.innerHeight;
        const tabbar = document.getElementById('tabbar').offsetHeight;
        const grab = this.el.querySelector('.sheet-grab').offsetHeight;
        const topSafe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
        const full = vh - tabbar - 64 - topSafe;
        // Peek = Griff + erste sichtbare Karte der aktiven Ansicht (falls sie nicht zu groß ist)
        const view = this.el.querySelector(`.view[data-view="${this.tab}"]`);
        const first = view && [...view.children].find(c => !c.hidden && c.offsetHeight > 0);
        const firstH = first ? first.offsetHeight + 14 : 0;
        const peek = grab + (firstH && firstH <= Math.min(240, full * 0.45) ? firstH : 0);
        this.heights = { peek, half: Math.min(full, Math.round(vh * 0.52)), full };
        this.el.style.height = full + 'px';
    },

    /** Setzt die Sheet-Position. */
    apply(animate = true) {
        if (this.isDesktop()) {
            this.el.style.transform = '';
            this.el.style.height = '';
            this.el.dataset.state = 'full';
            this.notify();
            return;
        }
        const h = this.heights[this.state];
        this.el.classList.toggle('animating', animate);
        this.el.style.transform = `translate3d(0, ${this.heights.full - h}px, 0)`;
        this.el.dataset.state = this.state;
        this.body.scrollTop = this.state === 'peek' ? 0 : this.body.scrollTop;
        this.notify();
    },

    notify() {
        const visible = this.isDesktop() ? 0 : this.heights[this.state] + document.getElementById('tabbar').offsetHeight;
        const side = this.isDesktop() ? this.el.offsetLeft + this.el.offsetWidth : 0;
        this.onChange?.({ state: this.state, tab: this.tab, visible, side });
    },

    setState(state, animate = true) { this.state = state; this.apply(animate); },

    openTab(tab, state) {
        this.tab = tab;
        $$('#tabbar .tab').forEach(b => {
            const on = b.dataset.tab === tab;
            b.classList.toggle('active', on);
            if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
        $$('.view').forEach(v => { v.hidden = v.dataset.view !== tab; });
        this.body.scrollTop = 0;
        this.measure();
        if (state) this.state = state;
        else if (this.state === 'peek') this.state = 'half';
        this.apply(true);
        store.emit('tab', tab);
    },

    onTab(tab) {
        if (!this.isDesktop() && tab === this.tab && this.state !== 'peek') { this.setState('peek'); return; }
        this.openTab(tab, tab === 'news' ? 'full' : undefined);
    },

    bindDrag() {
        const grab = document.getElementById('sheet-grab');
        let startY = 0, startOffset = 0, dragging = false, moved = false, lastY = 0, lastT = 0, velocity = 0;
        const offsetOf = (st) => this.heights.full - this.heights[st];

        const down = (y, e) => {
            if (this.isDesktop()) return;
            dragging = true; moved = false;
            startY = lastY = y; lastT = performance.now();
            startOffset = offsetOf(this.state);
            this.el.classList.remove('animating');
            e?.stopPropagation?.();
        };
        const move = (y, e) => {
            if (!dragging) return;
            const dy = y - startY;
            if (Math.abs(dy) > 4) moved = true;
            if (!moved) return;
            const now = performance.now();
            velocity = (y - lastY) / Math.max(1, now - lastT);
            lastY = y; lastT = now;
            const max = offsetOf('peek');
            let off = startOffset + dy;
            if (off < 0) off = off * 0.25;
            if (off > max) off = max + (off - max) * 0.25;
            this.el.style.transform = `translate3d(0, ${off}px, 0)`;
            if (e && e.cancelable) e.preventDefault();
        };
        const up = () => {
            if (!dragging) return;
            dragging = false;
            if (!moved) { // Tippen auf den Griff
                this.setState(this.state === 'peek' ? 'half' : this.state === 'half' ? 'full' : 'peek');
                return;
            }
            const cur = startOffset + (lastY - startY);
            // Offsets aufsteigend: full (0) < half < peek (max)
            const offs = ['full', 'half', 'peek'].map(st => [st, offsetOf(st)]);
            let target;
            if (velocity > 0.45) target = (offs.find(([, o]) => o > cur + 8) || offs[2])[0];
            else if (velocity < -0.45) target = ([...offs].reverse().find(([, o]) => o < cur - 8) || offs[0])[0];
            else target = offs.reduce((best, cand) => Math.abs(cand[1] - cur) < Math.abs(best[1] - cur) ? cand : best)[0];
            this.setState(target);
        };

        grab.addEventListener('touchstart', e => down(e.touches[0].clientY, e), { passive: true });
        grab.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
        grab.addEventListener('touchend', up);
        grab.addEventListener('touchcancel', up);
        grab.addEventListener('mousedown', e => {
            if (e.target.closest('button')) return;
            down(e.clientY, e);
            const mm = ev => move(ev.clientY, ev);
            const mu = () => { up(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
            window.addEventListener('mousemove', mm);
            window.addEventListener('mouseup', mu);
        });

        // Ziehen im Inhalt nach unten, wenn ganz oben gescrollt → Sheet verkleinern
        let bodyStart = null;
        this.body.addEventListener('touchstart', e => { bodyStart = this.body.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
        this.body.addEventListener('touchmove', e => {
            if (bodyStart === null || this.isDesktop()) return;
            const dy = e.touches[0].clientY - bodyStart;
            // in der Vorschau (Peek) lässt sich das Sheet auch über den Inhalt hochziehen
            if (!dragging && this.body.scrollTop <= 0 && (dy > 12 || (dy < -12 && this.state === 'peek'))) { down(bodyStart); }
            if (dragging) move(e.touches[0].clientY, e);
        }, { passive: false });
        this.body.addEventListener('touchend', () => { if (dragging) up(); bodyStart = null; });
        // Tippen auf die Vorschau öffnet das Sheet
        this.body.addEventListener('click', e => {
            if (this.isDesktop() || this.state !== 'peek' || e.target.closest('button, a, input')) return;
            this.setState('half');
        });
    }
};
