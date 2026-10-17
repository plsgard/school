// assets/gs/trace-score.js
// Pure corridor scorer. Coordinates in a 100x100 box. No DOM.
import { strokesOf, MAX_STROKES } from './trace-geom.js';

export { MAX_STROKES };
const R = 9;             // waypoint hit radius
const R_OUT = 13.5;      // beyond this from every waypoint = outside the corridor
const R_START = 12.6;
const R_END = 6;         // multi-stroke models: each stroke's last waypoint must really be reached (no stopping short)
const MIN_STROKE_LEN = 3; // path length below this = a tap, never scored
const COVER = 0.85;

// Same texts as the ui.trace-hint.* cues in renderers.js (one text per clip key; tested).
export const TRACE_HINTS = {
    start: 'Pars du point vert.',
    follow: 'Suis le chemin gris.',
    inside: 'Presque ! Reste dans le chemin.',
    arrows: 'Suis les flèches.',
};
// Stroke k (0-based) is expected next: same texts as UI_CUES.traceNext in renderers.js (k = 1 keeps ui.trace-blue).
export const NEXT_HINTS = {
    1: 'Maintenant, pars du point bleu !',
    2: 'Maintenant, pars du point orange !',
    3: 'Maintenant, pars du point violet !',
};

// Shoelace signed area of a closed polyline (y down: > 0 = clockwise on screen). Only its sign is used.
const signedArea = (poly) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const MIN_CLOSED_AREA = 20; // below this the model's turning sense is undefined: no direction check
// dirOrder 'top-first' (the 8): its lobes turn opposite ways and cancel in a whole-trace area, and drawn backwards
// from the green dot it turns the same ways (bottom lobe counter-clockwise first). So its direction is judged by
// order of reach, whatever the child's lobe sizes: the ink must reach the top band left of the start before the
// bottom band; and its head (everything before the bottom band) must turn the way the model's head turns.
function topFirst(poly, wp) {
    const ys = wp.map(p => p[1]), top = Math.min(...ys), bottom = Math.max(...ys), h = bottom - top;
    const inTop = (p) => p[1] < top + 0.2 * h && p[0] < wp[0][0] - 6, inBottom = (p) => p[1] > bottom - 0.2 * h;
    const iTop = poly.findIndex(inTop), iBottom = poly.findIndex(inBottom);
    return { reached: iTop >= 0 && (iBottom < 0 || iTop < iBottom), head: iBottom < 0 ? poly : poly.slice(0, iBottom) };
}

const dist = (p, w) => Math.hypot(p[0] - w[0], p[1] - w[1]);
const pathLen = (s) => s.reduce((a, p, i) => (i ? a + dist(s[i - 1], p) : 0), 0);
const isClosed = (wp) => dist(wp[0], wp[wp.length - 1]) < R_START;

// model: { strokes } or the legacy { pts, pts2? }, plus dirOrder? (spec addendum D7, flowchart §3).
// Real ink strokes (taps dropped) are segmented greedily in drawing order: each goes to the current model stroke k
// until k is done, then to k + 1; ink after the last stroke is extra (it only counts toward `outside`). An unfinished
// stroke keeps receiving ink, so a mid-stroke lift continues it. Q12: where stroke k ends on stroke k + 1's start
// (a corner), one pen stroke may run on into k + 1: it is split at the corner once k is done.
// Per stroke, on its own ink only: start (first ink point at its dot, nearer to it than to a later stroke's dot),
// coverage, end (multi-stroke: last waypoint within R_END) and, for a closed stroke (O, Q's ring, 0, 8), its turning
// direction (signed area; the 8 adds its order of reach, see topFirst). Robust to a start a few units off the dot,
// a wobble or an overshoot.
// Returns { ok, coverage, outside, startOk, hint, hintKey, next, waiting, keep }: next = the stroke expected,
// waiting = it has no ink yet (not a miss), keep = how many leading ink strokes belong to done strokes.
export function score(ink, model) {
    const S = strokesOf(model), N = S.length, multi = N >= 2;
    const real = ink.map((s, i) => [s, i]).filter(([s]) => pathLen(s) >= MIN_STROKE_LEN);
    const all = real.flatMap(([s]) => s);
    if (all.length < 8) return { ok: false, coverage: 0, outside: 0, startOk: false, hint: '', hintKey: '', next: 0, waiting: false, keep: 0 };

    const startOf = (k, p) => dist(p, S[k][0]) < R_START && S.every((t, j) => j <= k || dist(p, S[k][0]) <= dist(p, t[0]) + 1e-9);
    const reachedBy = (k, pts) => S[k].map(w => pts.some(p => dist(p, w) < R));
    const endBy = (k, pts) => !multi || pts.some(p => dist(p, S[k][S[k].length - 1]) < R_END);
    function dirOk(k, pts) {
        if (!isClosed(S[k])) return true;
        const order = k === 0 && model.dirOrder === 'top-first';
        const inked = order ? topFirst(pts, S[k]) : { reached: true, head: pts };
        const modelArea = signedArea(order ? topFirst(S[k], S[k]).head : S[k]);
        return inked.reached && (Math.abs(modelArea) < MIN_CLOSED_AREA || Math.sign(signedArea(inked.head)) === Math.sign(modelArea));
    }
    const judge = (k, pts) => {
        const reached = reachedBy(k, pts);
        const r = { start: pts.length > 0 && startOf(k, pts[0]), cov: reached.filter(Boolean).length / S[k].length, end: endBy(k, pts) };
        r.dir = dirOk(k, pts);
        r.done = r.start && r.cov >= COVER && r.end && r.dir;
        return r;
    };
    // Q12: index in `rest` where stroke k (already holding `prev`) is done, at the point nearest its corner, when the
    // remainder then really heads off along stroke k + 1 (an overshoot at the corner is not a new stroke); else -1.
    function cornerSplit(k, prev, rest) {
        if (k + 1 >= N || isClosed(S[k])) return -1;
        const corner = S[k][S[k].length - 1];
        if (dist(corner, S[k + 1][0]) > R_START || !prev.concat(rest).length || !startOf(k, (prev[0] ?? rest[0]))) return -1;
        const reached = reachedBy(k, prev);
        let end = prev.some(p => dist(p, corner) < R_END), i0 = -1;
        for (let i = 0; i < rest.length; i++) {
            S[k].forEach((w, j) => { if (!reached[j] && dist(rest[i], w) < R) reached[j] = true; });
            if (dist(rest[i], corner) < R_END) end = true;
            if (end && reached.filter(Boolean).length / S[k].length >= COVER) { i0 = i; break; }
        }
        if (i0 < 0) return -1;
        let best = i0;
        for (let i = i0; i < rest.length && dist(rest[i], corner) < R_START; i++) if (dist(rest[i], corner) < dist(rest[best], corner)) best = i;
        const remainder = rest.slice(best);
        return remainder.some(p => dist(p, corner) >= R_START) ? best : -1;
    }

    const segs = S.map(() => ({ pts: [], inks: [] }));
    const extra = [];
    let k = 0;
    for (const [s, j] of real) {
        let rest = s;
        while (rest.length) {
            if (k >= N) { extra.push(...rest); break; }
            const seg = segs[k];
            const cut = cornerSplit(k, seg.pts, rest);
            if (cut >= 0) {
                seg.pts.push(...rest.slice(0, cut + 1)); seg.inks.push(j);
                rest = rest.slice(cut); k++;
                continue;
            }
            seg.pts.push(...rest); seg.inks.push(j); rest = [];
            if (judge(k, seg.pts).done) k++;
        }
    }

    const res = segs.map((g, i) => judge(i, g.pts));
    const cur = res.findIndex(r => !r.done), next = cur < 0 ? N : cur;
    const wp = S.flat();
    const outside = all.filter(p => !wp.some(w => dist(p, w) < R_OUT)).length / all.length;
    const coverage = Math.min(...res.map(r => r.cov));
    const startOk = segs[0].pts.length > 0 && res.every((r, i) => !segs[i].pts.length || r.start);
    // keep: leading ink strokes (taps included) up to the last one lying wholly in done segments.
    const inDone = new Set(segs.slice(0, next).flatMap(g => g.inks));
    const partly = new Set(segs.slice(next).flatMap(g => g.inks));
    let keep = 0;
    for (const [, j] of real) { if (inDone.has(j) && !partly.has(j)) keep = j + 1; else break; }
    let hintKey, waiting = false;
    if (next === N) hintKey = outside < 0.25 ? '' : 'inside';
    else if (!segs[next].pts.length) { hintKey = outside < 0.25 ? 'next' : 'inside'; waiting = hintKey === 'next'; }
    else if (!res[next].start) hintKey = next === 0 ? 'start' : 'next';
    else if (res[next].cov < COVER || !res[next].end) hintKey = 'follow';
    else hintKey = 'arrows';
    const ok = hintKey === '';
    const hint = hintKey === 'next' ? NEXT_HINTS[next] : TRACE_HINTS[hintKey] ?? '';
    // An 'inside' miss: the wandering ink sits in done strokes too, so nothing is kept (a clean redraw must pass).
    return { ok, coverage, outside, startOk, hint, hintKey, next, waiting, keep: ok ? ink.length : hintKey === 'inside' ? 0 : keep };
}

// Strokes too short to earn a hint (a stray tap) are dropped before the next stroke starts: otherwise the tap stays
// in `strokes` (P3). A scored attempt (ok or hinted) is kept; a list of taps only becomes [].
export function keepStrokes(strokes, model) {
    if (strokes.every(s => pathLen(s) < MIN_STROKE_LEN)) return [];
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
