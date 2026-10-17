// assets/gs/trace-score.js
// Pure corridor scorer. Coordinates in a 100x100 box. No DOM.

const R = 9;             // waypoint hit radius
const R_OUT = 13.5;      // beyond this from every waypoint = outside the corridor
const R_START = 12.6;

// Same texts as the ui.trace-hint.* cues in renderers.js (one text per clip key; tested).
export const TRACE_HINTS = {
    start: 'Pars du point vert.',
    follow: 'Suis le chemin gris.',
    inside: 'Presque\u00a0! Reste dans le chemin.',
    arrows: 'Suis les flèches.',
    blue: 'Maintenant, pars du point bleu\u00a0!', // two-stroke model: green stroke done, blue one not started
};

// Shoelace signed area of a closed polyline (y down: > 0 = clockwise on screen). Only its sign is used.
const signedArea = (poly) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const MIN_CLOSED_AREA = 20; // below this the model's turning sense is undefined (balanced 8): no direction check

// model: { pts, pts2? }. With pts2 (x, 4, 5) both strokes must be covered. A closed model (0, 8: start and end
// within R_START) cannot be told apart by its start, so its direction is checked instead (spec §8.5): the ink
// must turn the same way as the model (same sign of signed area). Robust to a start a few units off the dot,
// a wobble or an overshoot, unlike comparing when two waypoints are first reached.
export function score(strokes, model) {
    const pts = strokes.flat();
    if (pts.length < 8) return { ok: false, coverage: 0, outside: 0, startOk: false, hint: '', hintKey: '' };
    const main = model.pts, second = model.pts2 ?? [];
    const dist = (p, w) => Math.hypot(p[0] - w[0], p[1] - w[1]);
    const covered = (wp) => wp.filter(w => pts.some(p => dist(p, w) < R)).length / wp.length;
    const coverMain = covered(main);
    const coverage = second.length ? Math.min(coverMain, covered(second)) : coverMain;
    const wp = [...main, ...second];
    const outside = pts.filter(p => !wp.some(w => dist(p, w) < R_OUT)).length / pts.length;
    const startOk = dist(pts[0], main[0]) < R_START;
    const closed = dist(main[0], main[main.length - 1]) < R_START;
    const modelArea = closed ? signedArea(main) : 0;
    const dirOk = Math.abs(modelArea) < MIN_CLOSED_AREA || Math.sign(signedArea(pts)) === Math.sign(modelArea);
    const ok = coverage >= 0.85 && outside < 0.25 && startOk && dirOk;
    const blue = second.length > 0 && coverMain >= 0.85 && coverage < 0.85 && outside < 0.25; // only the blue stroke is missing
    const hintKey = ok ? '' : !startOk ? 'start' : blue ? 'blue' : coverage < 0.85 ? 'follow' : !dirOk ? 'arrows' : 'inside';
    return { ok, coverage, outside, startOk, hint: TRACE_HINTS[hintKey] ?? '', hintKey };
}

// Strokes too short to earn a hint (a stray tap) are dropped before the next stroke starts: otherwise the tap stays
// first in `strokes` and the real stroke fails "Pars du point vert." (P3). A scored attempt (ok or hinted) is kept.
// Two-stroke models: the green stroke is done (it alone would pass) but the letter is not, so the child
// must now go to the blue dot. False on one-stroke models and once the whole letter passes.
export function firstStrokeDone(strokes, model) {
    if (!model.pts2) return false;
    return score(strokes, { pts: model.pts }).ok && !score(strokes, model).ok;
}

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
