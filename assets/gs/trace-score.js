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
const MIN_CLOSED_AREA = 20; // below this the model's turning sense is undefined: no direction check
const R_END = 6;         // the last two waypoints of a blue stroke must really be reached (a half stroke is not enough)
// dirOrder 'top-first' (the 8): its lobes turn opposite ways and cancel in a whole-trace area, and drawn backwards
// from the green dot it turns the same ways (bottom lobe counter-clockwise first). So its direction is judged by
// order of reach, whatever the child's lobe sizes: the ink must reach the top band left of the start before the
// bottom band; and its head (everything before the bottom band) must turn the way the model's head turns.
function topFirst(poly, model) {
    const ys = model.pts.map(p => p[1]), top = Math.min(...ys), bottom = Math.max(...ys), h = bottom - top;
    const inTop = (p) => p[1] < top + 0.2 * h && p[0] < model.pts[0][0] - 6, inBottom = (p) => p[1] > bottom - 0.2 * h;
    const iTop = poly.findIndex(inTop), iBottom = poly.findIndex(inBottom);
    return { reached: iTop >= 0 && (iBottom < 0 || iTop < iBottom), head: iBottom < 0 ? poly : poly.slice(0, iBottom) };
}

// model: { pts, pts2?, dirOrder? }. With pts2 (x, 4, 5) both strokes must be covered, the blue one to its end, and
// the attempt must start at the green dot. A closed model (0, 8: start and end within R_START) cannot be told apart
// by its start, so its direction is checked instead (spec §8.5): the ink must turn the same way as the model (same
// sign of signed area; the 8 adds its order of reach, see topFirst). Robust to a start a few units off the dot,
// a wobble or an overshoot, unlike comparing when two waypoints are first reached.
export function score(strokes, model) {
    const pts = strokes.flat();
    if (pts.length < 8) return { ok: false, coverage: 0, outside: 0, startOk: false, hint: '', hintKey: '' };
    const main = model.pts, second = model.pts2 ?? [];
    const dist = (p, w) => Math.hypot(p[0] - w[0], p[1] - w[1]);
    const covered = (wp, rEnd = R) => wp.filter((w, i) => pts.some(p => dist(p, w) < (i >= wp.length - 2 ? rEnd : R))).length / wp.length;
    const coverMain = covered(main);
    const coverage = second.length ? Math.min(coverMain, covered(second, R_END)) : coverMain;
    const wp = [...main, ...second];
    const outside = pts.filter(p => !wp.some(w => dist(p, w) < R_OUT)).length / pts.length;
    // Two-stroke models: the attempt starts at the green dot, never at the blue one.
    const startOk = dist(pts[0], main[0]) < R_START && (!second.length || dist(pts[0], main[0]) < dist(pts[0], second[0]));
    const closed = dist(main[0], main[main.length - 1]) < R_START;
    let dirOk = true;
    if (closed) {
        const order = model.dirOrder === 'top-first';
        const ink = order ? topFirst(pts, model) : { reached: true, head: pts };
        const modelArea = signedArea(order ? topFirst(main, model).head : main);
        dirOk = ink.reached && (Math.abs(modelArea) < MIN_CLOSED_AREA || Math.sign(signedArea(ink.head)) === Math.sign(modelArea));
    }
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

// Blue-dot state (two-stroke models, green stroke done). Waiting is not a miss (Q8) and stays silent right after the
// blue cue; a blue result after a fresh stroke drawn since the last cue says the cue again and counts as a miss,
// so the two-miss "Suivant" can still come.
export function createBlueTracker() {
    let fresh = 0;
    return {
        cueSaid() { fresh = 0; },
        stroke() { fresh++; },
        blue() { const f = fresh > 0; fresh = 0; return { speak: f, miss: f }; },
    };
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
