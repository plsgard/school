// assets/gs/trace-score.js
// Pure corridor scorer. Coordinates in a 100x100 box. No DOM.

const R = 9;             // waypoint hit radius
const R_OUT = 13.5;      // beyond this from every waypoint = outside the corridor
const R_START = 12.6;

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
    const HINTS = { start: 'Pars du point vert', follow: 'Suis le chemin gris', inside: 'Presque ! Reste dans le chemin' };
    const hintKey = ok ? '' : !startOk ? 'start' : coverage < 0.85 ? 'follow' : 'inside';
    return { ok, coverage, outside, startOk, hint: HINTS[hintKey] ?? '', hintKey };
}

export function createPointerFilter() {
    let penSeen = false;
    return {
        accept(pointerType) {
            if (pointerType === 'pen') { penSeen = true; return true; }
            if (pointerType === 'touch') return !penSeen;
            return true; // mouse
        },
    };
}
