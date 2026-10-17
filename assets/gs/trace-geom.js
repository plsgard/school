// assets/gs/trace-geom.js
// Pure tracing geometry, shared by the canvas (trace.js) and the preview tool (tools/trace-sheet.mjs),
// so a rendered check shows exactly what the child sees. Coordinates live in a 100 × 100 box.

// Lignage, top to bottom (spec §8.1). The hampe line (t, d, digit tops) is a guide only: never drawn by the app.
export const LIGNAGE = { ascender: 16, hampe: 30, xHeight: 42, baseline: 72, descender: 92 };

// Lines and band per model kind (addendum D2), shared by the canvas and the sheet. Cursive letters and digits: tinted
// x-height band, faint ascender and descender lines, x-height line, strong baseline. Capitals span 16 → 72 with no band
// (a band would say "letters live here"): a cap line as strong as the baseline's colour, a faint bar guide at 44.
// width is in canvas px; the sheet scales it by 0.35.
export function lignageFor(kind = 'cursive') {
    if (kind === 'cap') return { band: null, lines: [{ y: 16, color: '#9fb2cf', width: 1.5 }, { y: 44, color: '#eef2f8', width: 1 }, { y: 72, color: '#9fb2cf', width: 2 }] };
    const L = LIGNAGE;
    return {
        band: [L.xHeight, L.baseline, '#f3f7fc'],
        lines: [{ y: L.ascender, color: '#eef2f8', width: 1 }, { y: L.xHeight, color: '#dfe7f2', width: 1 }, { y: L.baseline, color: '#9fb2cf', width: 2 }, { y: L.descender, color: '#eef2f8', width: 1 }],
    };
}

// N ordered strokes (addendum D1). Deck capitals give `strokes`; cursive letters and digits may still come as the
// legacy { pts, pts2 } shape (tests, older callers): both normalise to the same list.
export const strokesOf = (model) => model.strokes ?? [model.pts, model.pts2].filter(Boolean);
export const MAX_STROKES = 4; // E, M, W
// Start-dot colour by stroke index: 1 green, 2 blue (x, 4 and 5 keep their look), 3 orange, 4 violet.
export const DOT_COLORS = ['#4cb944', '#4c8fd9', '#f08c00', '#9b59b6'];
const COINCIDENT = 7; // a pending dot this close to a dot already shown waits until the earlier stroke is done

// Dots to draw while `cur` strokes are done (addendum D5): done strokes lose their dot, the active one is filled,
// pending ones are rings. Digits only on multi-stroke models. Shared by trace.js and tools/trace-sheet.mjs.
export function startDots(strokes, cur = 0) {
    const digit = strokes.length >= 2, shown = [];
    for (let k = cur; k < strokes.length; k++) {
        const [x, y] = strokes[k][0];
        if (k > cur && shown.some(s => Math.hypot(s.x - x, s.y - y) < COINCIDENT)) continue;
        shown.push({ x, y, n: k + 1, color: DOT_COLORS[k], active: k === cur, digit });
    }
    return shown;
}

// Catmull-Rom through the waypoints, as cubic Bézier segments [c1x, c1y, c2x, c2y, x, y] (one per waypoint pair):
// sharp at retrace reversals, smooth elsewhere. Midpoint quadratics were tried and rejected: they cut reversals
// short (m/n legs, s closure).
export function curveSegments(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
        segs.push([
            b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6,
            c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6,
            c[0], c[1],
        ]);
    }
    return segs;
}

// Arrow positions by arc length. On a retraced part of the path (stems of d p h k, …) one arrow would point both
// ways, so it becomes a pair of opposite arrows set PAIR_OFFSET beside the stroke, each on the right of its own
// direction (↓ on one side, ↑ on the other); the way back does not add a second pair where one already stands.
const PAIR_OFFSET = 2.5;
export function arrowSpots(pts, every = 22, first = 12) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segs.push({ a, b, from: total, len });
        total += len;
    }
    const at = (d) => {
        const sg = segs.find(x => d <= x.from + x.len) ?? segs[segs.length - 1];
        const t = sg.len ? (d - sg.from) / sg.len : 0;
        return { x: sg.a[0] + (sg.b[0] - sg.a[0]) * t, y: sg.a[1] + (sg.b[1] - sg.a[1]) * t, ang: Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0]) };
    };
    const spots = [], pairs = [];
    for (let d = first; d < total - 4; d += every) {
        const p = at(d);
        let retraced = false;
        for (let e = 0; e <= total && !retraced; e += 1) {
            if (Math.abs(e - d) < 10) continue;
            const q = at(e);
            // Same place, opposite way (within ~15°): a retrace. A crossing or a same-way overlap keeps its one arrow.
            if (Math.hypot(q.x - p.x, q.y - p.y) < 3 && Math.cos(q.ang - p.ang) < -0.96) retraced = true;
        }
        if (!retraced) { spots.push(p); continue; }
        if (pairs.some(q => Math.hypot(q.x - p.x, q.y - p.y) < every * 0.6)) continue; // the way back: already paired
        pairs.push(p);
        const [ox, oy] = [-Math.sin(p.ang) * PAIR_OFFSET, Math.cos(p.ang) * PAIR_OFFSET]; // right of the travel direction
        spots.push({ x: p.x + ox, y: p.y + oy, ang: p.ang }, { x: p.x - ox, y: p.y - oy, ang: p.ang + (p.ang > 0 ? -Math.PI : Math.PI) });
    }
    return spots;
}
