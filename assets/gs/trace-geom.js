// assets/gs/trace-geom.js
// Pure tracing geometry, shared by the canvas (trace.js) and the preview tool (tools/trace-sheet.mjs),
// so a rendered check shows exactly what the child sees. Coordinates live in a 100 × 100 box.

// Lignage, top to bottom (spec §8.1). The hampe line (t, d, digit tops) is a guide only: never drawn by the app.
export const LIGNAGE = { ascender: 16, hampe: 30, xHeight: 42, baseline: 72, descender: 92 };

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

// Arrow positions by arc length, skipping spots that sit on a retraced part of the path (they would point both ways).
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
    const spots = [];
    for (let d = first; d < total - 4; d += every) {
        const p = at(d);
        let retraced = false;
        for (let e = 0; e <= total && !retraced; e += 1) {
            if (Math.abs(e - d) < 10) continue;
            const q = at(e);
            if (Math.hypot(q.x - p.x, q.y - p.y) < 3) retraced = true;
        }
        if (!retraced) spots.push(p);
    }
    return spots;
}
