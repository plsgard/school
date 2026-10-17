// assets/gs/trace-score.js
// Pure corridor scorer. Coordinates in a 100x100 box. No DOM.

const R = 9;             // waypoint hit radius
const R_OUT = 13.5;      // beyond this from every waypoint = outside the corridor
const R_START = 12.6;

// Same texts as the ui.trace-hint.* cues in renderers.js (one text per clip key; tested).
export const TRACE_HINTS = { start: 'Pars du point vert.', follow: 'Suis le chemin gris.', inside: 'Presque\u00a0! Reste dans le chemin.' };

export function score(strokes, model) {
    const pts = strokes.flat();
    if (pts.length < 8) return { ok: false, coverage: 0, outside: 0, startOk: false, hint: '', hintKey: '' };
    const wp = model.pts;
    const dist = (p, w) => Math.hypot(p[0] - w[0], p[1] - w[1]);
    const hit = wp.filter(w => pts.some(p => dist(p, w) < R)).length;
    const outside = pts.filter(p => !wp.some(w => dist(p, w) < R_OUT)).length / pts.length;
    const coverage = hit / wp.length;
    const startOk = dist(pts[0], wp[0]) < R_START;
    const ok = coverage >= 0.85 && outside < 0.25 && startOk;
    const hintKey = ok ? '' : !startOk ? 'start' : coverage < 0.85 ? 'follow' : 'inside';
    return { ok, coverage, outside, startOk, hint: TRACE_HINTS[hintKey] ?? '', hintKey };
}

// Strokes too short to earn a hint (a stray tap) are dropped before the next stroke starts: otherwise the tap stays
// first in `strokes` and the real stroke fails "Pars du point vert." (P3). A scored attempt (ok or hinted) is kept.
export function keepStrokes(strokes, model) {
    const r = score(strokes, model);
    return r.ok || r.hintKey ? strokes : [];
}

// Once a Pencil is seen, touches (palm, fingers) are rejected. The lock decays after penTimeoutMs without pen
// input, so a child who puts the Pencil down can carry on with a finger.
export function createPointerFilter({ penTimeoutMs = 30_000, now = () => Date.now() } = {}) {
    let lastPen = null;
    return {
        accept(pointerType) {
            if (pointerType === 'pen') { lastPen = now(); return true; }
            if (pointerType === 'touch') return lastPen === null || now() - lastPen > penTimeoutMs;
            return true; // mouse
        },
    };
}
