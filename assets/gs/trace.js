// assets/gs/trace.js
// Two canvases: model (GS guide lines, grey corridor, start dot, arrows) and ink. Pointer Events, Pencil pressure.
// Scoring uses the raw waypoints (trace-score.js); only the drawing is smoothed.
// A lift that does not complete the letter waits LIFT_GRACE_MS before it is scored: a pointerdown in that window
// continues the same attempt (two-stroke letters, a mid-letter lift). Only once a hint was given does the next
// pointerdown start a new attempt; the canvas also clears its own ink FAIL_CLEAR_MS after the hint, so every
// attempt is scored on its own strokes. onResult's contract is unchanged.
import { score, createPointerFilter } from './trace-score.js';

// One filter for the whole page session: once a Pencil has been seen, finger/palm touches stay rejected
// on every later trace canvas too, until ~30 s pass without any Pencil input (trace-score.js).
const filter = createPointerFilter();

const FAIL_CLEAR_MS = 1200;   // after a failed attempt, the ink is cleared so the next try is scored alone
const LIFT_GRACE_MS = 900;    // a lift shorter than this is part of the same attempt
const BASELINE = 72, XHEIGHT = 42, ASCENDER = 16;

// Arrow positions by arc length, skipping spots that sit on a retraced part of the path.
function arrowSpots(pts, every = 22, first = 12) {
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

export function mountTrace(container, model, { onResult }) {
    container.innerHTML = '<canvas class="trace-model"></canvas><canvas class="trace-ink"></canvas>';
    const [cm, ci] = container.querySelectorAll('canvas');
    let W = 300, dprUsed = 0, strokes = [], drawing = false, activeId = null, activeType = '', mctx, ictx;
    let failTimer = null, failPending = false, graceTimer = null;

    function size() {
        const r = container.getBoundingClientRect();
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        W = Math.max(200, Math.round(Math.min(r.width, r.height)));
        dprUsed = dpr;
        for (const c of [cm, ci]) { c.width = Math.round(W * dpr); c.height = Math.round(W * dpr); }
        mctx = cm.getContext('2d'); ictx = ci.getContext('2d');
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0); ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawModel() {
        const s = W / 100;
        mctx.clearRect(0, 0, W, W);
        // Simplified GS lignage: tinted x-height band, faint ascender line, x-height line, strong baseline.
        mctx.fillStyle = '#f3f7fc'; mctx.fillRect(0, XHEIGHT * s, W, (BASELINE - XHEIGHT) * s);
        const line = (y, color, width) => { mctx.strokeStyle = color; mctx.lineWidth = width; mctx.beginPath(); mctx.moveTo(0, y * s); mctx.lineTo(W, y * s); mctx.stroke(); };
        line(ASCENDER, '#eef2f8', 1);
        line(XHEIGHT, '#dfe7f2', 1);
        line(BASELINE, '#9fb2cf', 2);
        // Corridor drawn as a Catmull-Rom curve through every waypoint (sharp at retrace reversals, smooth elsewhere).
        // Midpoint quadratics were tried and rejected: they cut reversals short (m/n legs, s closure).
        const path = (pts, width, color) => {
            mctx.strokeStyle = color; mctx.lineWidth = width * s; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
            mctx.beginPath(); mctx.moveTo(pts[0][0] * s, pts[0][1] * s);
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
                mctx.bezierCurveTo(
                    (b[0] + (c[0] - a[0]) / 6) * s, (b[1] + (c[1] - a[1]) / 6) * s,
                    (c[0] - (d[0] - b[0]) / 6) * s, (c[1] - (d[1] - b[1]) / 6) * s,
                    c[0] * s, c[1] * s);
            }
            mctx.stroke();
        };
        path(model.pts, 3.5, '#b9c6d9');
        if (model.bar) path(model.bar, 3.5, '#b9c6d9');
        if (model.dot) { mctx.fillStyle = '#b9c6d9'; mctx.beginPath(); mctx.arc(model.dot[0] * s, model.dot[1] * s, 3 * s, 0, 7); mctx.fill(); }
        mctx.fillStyle = '#8fa3c2';
        for (const { x, y, ang } of arrowSpots(model.pts)) {
            mctx.save(); mctx.translate(x * s, y * s); mctx.rotate(ang);
            mctx.beginPath(); mctx.moveTo(1.1 * s, 0); mctx.lineTo(-1.1 * s, -1.6 * s); mctx.lineTo(-1.1 * s, 1.6 * s); mctx.closePath(); mctx.fill(); mctx.restore();
        }
        mctx.fillStyle = '#4cb944'; mctx.beginPath(); mctx.arc(model.pts[0][0] * s, model.pts[0][1] * s, 3.2 * s, 0, 7); mctx.fill();
    }

    const pos = (e) => { const r = ci.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100, e.pressure || 0.5, e.pointerType]; };

    function inkSegment(q, p) {
        const s = W / 100;
        ictx.strokeStyle = '#223252'; ictx.lineCap = 'round';
        ictx.lineWidth = (p[3] === 'pen' ? 2 + p[2] * 6 : 5) * s / 2.2;
        ictx.beginPath(); ictx.moveTo(q[0] * s, q[1] * s); ictx.lineTo(p[0] * s, p[1] * s); ictx.stroke();
    }
    function redrawInk() {
        ictx.clearRect(0, 0, W, W);
        for (const st of strokes) for (let i = 1; i < st.length; i++) inkSegment(st[i - 1], st[i]);
    }
    function dropActiveStroke() {
        strokes.pop();
        drawing = false; activeId = null; activeType = '';
        redrawInk();
    }

    function down(e) {
        if (!filter.accept(e.pointerType)) return;            // always run first: a pen must flip the filter
        if (drawing) {
            if (e.pointerType !== 'pen' || activeType === 'pen') return;
            dropActiveStroke();                                  // palm/finger stroke in progress: the Pencil wins
        }
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; } // lifted and came back: same attempt
        else if (failPending) reset();                          // new attempt before the auto-clear fired
        if (e.pointerType === 'pen' && strokes.some(st => st[0][3] !== 'pen')) {
            strokes = strokes.filter(st => st[0][3] === 'pen');  // the palm landed before the Pencil: drop its ink
            redrawInk();
        }
        e.preventDefault();
        drawing = true; activeId = e.pointerId; activeType = e.pointerType;
        strokes.push([pos(e)]);
        try { ci.setPointerCapture(e.pointerId); } catch { /* capture is a nicety: a stroke must never be left without points */ }
    }
    function move(e) {
        if (!drawing || e.pointerId !== activeId) return;
        e.preventDefault();
        const p = pos(e), st = strokes[strokes.length - 1];
        if (!st) { drawing = false; return; } // defensive: a move with no stroke (reset mid-gesture)
        inkSegment(st[st.length - 1], p);
        st.push(p);
    }
    function up(e) {
        if (!drawing || e.pointerId !== activeId) return;
        drawing = false; activeId = null; activeType = '';
        const r = score(strokes, model);
        if (r.ok) { onResult(r); return; }
        clearTimeout(graceTimer);
        graceTimer = setTimeout(settleLift, LIFT_GRACE_MS);
    }
    // The child did not come back within the grace window: score what is there and give the hint.
    function settleLift() {
        graceTimer = null;
        if (drawing) return;
        const r = score(strokes, model);
        if (!r.ok && r.hintKey) {
            failPending = true;
            failTimer = setTimeout(() => { if (!drawing) reset(); }, FAIL_CLEAR_MS);
        }
        onResult(r);
    }
    function cancel(e) {
        if (!drawing || e.pointerId !== activeId) return;
        dropActiveStroke();                                      // an interrupted stroke is discarded, never scored
    }

    function reset() {
        clearTimeout(failTimer); failTimer = null; failPending = false;
        clearTimeout(graceTimer); graceTimer = null;
        strokes = []; drawing = false; activeId = null; activeType = '';
        ictx.clearRect(0, 0, W, W); drawModel();
    }
    // iPad Safari fires resize for toolbar moves too: only a real size change re-lays the canvases (and clears ink).
    const onResize = () => {
        const r = container.getBoundingClientRect();
        const w = Math.max(200, Math.round(Math.min(r.width, r.height)));
        if (w === W && Math.min(3, window.devicePixelRatio || 1) === dprUsed) return;
        size(); reset();
    };

    size(); reset();
    ci.addEventListener('pointerdown', down);
    ci.addEventListener('pointermove', move);
    for (const ev of ['pointerup', 'pointerleave']) ci.addEventListener(ev, up);
    ci.addEventListener('pointercancel', cancel);
    window.addEventListener('resize', onResize);

    return { reset, destroy() { clearTimeout(failTimer); clearTimeout(graceTimer); window.removeEventListener('resize', onResize); container.innerHTML = ''; } };
}
