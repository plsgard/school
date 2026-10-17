// assets/gs/trace.js
// Two canvases: model (GS guide lines, grey corridor, start dot, arrows) and ink. Pointer Events, Pencil pressure.
// Scoring uses the raw waypoints (trace-score.js); only the drawing is smoothed.
// A lift that does not complete the letter waits LIFT_GRACE_MS (TWO_STROKE_GRACE_MS for a pts2 model) before it is scored: a pointerdown in that window
// continues the same attempt (two-stroke letters, a mid-letter lift). Only once a hint was given does the next
// pointerdown start a new attempt; the canvas also clears its own ink FAIL_CLEAR_MS after the hint, so every
// attempt is scored on its own strokes. onResult's contract is unchanged.
import { score, createPointerFilter, keepStrokes, firstStrokeDone } from './trace-score.js';
import { LIGNAGE, curveSegments, arrowSpots } from './trace-geom.js';

// One filter for the whole page session: once a Pencil has been seen, finger/palm touches stay rejected
// on every later trace canvas too, until ~30 s pass without any Pencil input (trace-score.js).
const filter = createPointerFilter();

const FAIL_CLEAR_MS = 1200;   // after a failed attempt, the ink is cleared so the next try is scored alone
const LIFT_GRACE_MS = 900;    // a lift shorter than this is part of the same attempt
const TWO_STROKE_GRACE_MS = 2500; // two-stroke models (x, 4, 5): time to move the hand to the blue dot

// onStroke1 (optional): two-stroke models only, called once per attempt when the green stroke is done and the
// grace window for the blue stroke starts (the page says "Maintenant, pars du point bleu !").
export function mountTrace(container, model, { onResult, onStroke1 = () => {} }) {
    container.innerHTML = '<canvas class="trace-model"></canvas><canvas class="trace-ink"></canvas>';
    const [cm, ci] = container.querySelectorAll('canvas');
    let W = 300, dprUsed = 0, strokes = [], drawing = false, activeId = null, activeType = '', mctx, ictx;
    let failTimer = null, failPending = false, graceTimer = null, blueSaid = false;

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
        const s = W / 100, L = LIGNAGE;
        mctx.clearRect(0, 0, W, W);
        // Simplified GS lignage: tinted x-height band, faint ascender and descender lines, x-height line, strong baseline.
        mctx.fillStyle = '#f3f7fc'; mctx.fillRect(0, L.xHeight * s, W, (L.baseline - L.xHeight) * s);
        const line = (y, color, width) => { mctx.strokeStyle = color; mctx.lineWidth = width; mctx.beginPath(); mctx.moveTo(0, y * s); mctx.lineTo(W, y * s); mctx.stroke(); };
        line(L.ascender, '#eef2f8', 1);
        line(L.xHeight, '#dfe7f2', 1);
        line(L.baseline, '#9fb2cf', 2);
        line(L.descender, '#eef2f8', 1);
        // Corridor drawn as a Catmull-Rom curve through every waypoint (trace-geom.js curveSegments).
        const path = (pts, width, color) => {
            mctx.strokeStyle = color; mctx.lineWidth = width * s; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
            mctx.beginPath(); mctx.moveTo(pts[0][0] * s, pts[0][1] * s);
            for (const g of curveSegments(pts)) mctx.bezierCurveTo(g[0] * s, g[1] * s, g[2] * s, g[3] * s, g[4] * s, g[5] * s);
            mctx.stroke();
        };
        const arrows = (pts) => {
            mctx.fillStyle = '#8fa3c2';
            for (const { x, y, ang } of arrowSpots(pts)) {
                mctx.save(); mctx.translate(x * s, y * s); mctx.rotate(ang);
                mctx.beginPath(); mctx.moveTo(1.1 * s, 0); mctx.lineTo(-1.1 * s, -1.6 * s); mctx.lineTo(-1.1 * s, 1.6 * s); mctx.closePath(); mctx.fill(); mctx.restore();
            }
        };
        const dot = ([x, y], r, color) => { mctx.fillStyle = color; mctx.beginPath(); mctx.arc(x * s, y * s, r * s, 0, 7); mctx.fill(); };
        path(model.pts, 3.5, '#b9c6d9');
        if (model.pts2) path(model.pts2, 3.5, '#b9c6d9');
        if (model.bar) path(model.bar, 3.5, '#b9c6d9');
        if (model.dot) dot(model.dot, 3, '#b9c6d9');
        arrows(model.pts);
        if (model.pts2) { arrows(model.pts2); dot(model.pts2[0], 2.4, '#4c8fd9'); } // second stroke: smaller blue start, under the green one
        dot(model.pts[0], 3.2, '#4cb944');
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
        dropStray();                                            // a stray tap must not become this stroke's start
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
        graceTimer = setTimeout(settleLift, model.pts2 ? TWO_STROKE_GRACE_MS : LIFT_GRACE_MS);
        if (!blueSaid && firstStrokeDone(strokes, model)) { blueSaid = true; onStroke1(); }
    }
    // The child did not come back within the grace window: score what is there and give the hint.
    function dropStray() {
        if (!strokes.length) return;
        const kept = keepStrokes(strokes, model);
        if (kept !== strokes) { strokes = kept; redrawInk(); }
    }
    function settleLift() {
        graceTimer = null;
        if (drawing) return;
        const r = score(strokes, model);
        if (!r.ok && !r.hintKey) dropStray();                  // too short to score (a tap): wipe it, it is not a miss
        // 'blue': the green stroke is good, only the blue one is missing — keep the ink so the child can go on from the blue dot.
        if (!r.ok && r.hintKey && r.hintKey !== 'blue') {
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
        strokes = []; drawing = false; activeId = null; activeType = ''; blueSaid = false;
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
