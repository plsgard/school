// assets/gs/trace.js
// Two canvases: model (lignage, grey corridors, numbered start dots, arrows) and ink. Pointer Events, Pencil pressure.
// Scoring uses the raw waypoints (trace-score.js); only the drawing is smoothed.
// A lift that does not complete the letter waits LIFT_GRACE_MS (MULTI_STROKE_GRACE_MS for a model of ≥ 2 strokes)
// before it is scored: a pointerdown in that window continues the same attempt (the next stroke, a mid-letter lift).
// Only once a hint was given does the next pointerdown start a new attempt; the canvas also clears the failed ink
// FAIL_CLEAR_MS after the hint, keeping the strokes already done (score's `keep`), so the child goes on from the
// next dot.
import { score, createPointerFilter, keepStrokes } from './trace-score.js';
import { curveSegments, arrowSpots, strokesOf, startDots, lignageFor } from './trace-geom.js';

// One filter for the whole page session: once a Pencil has been seen, finger/palm touches stay rejected
// on every later trace canvas too, until ~30 s pass without any Pencil input (trace-score.js).
const filter = createPointerFilter();

const FAIL_CLEAR_MS = 1200;   // after a failed attempt, the ink is cleared so the next try is scored alone
const LIFT_GRACE_MS = 900;    // a lift shorter than this is part of the same attempt
const MULTI_STROKE_GRACE_MS = 2500; // models of ≥ 2 strokes: time to move the hand to the next dot
const NEXT_IDLE_MS = 8000;    // nothing drawn this long while waiting at a dot: its cue is said again (once per idle period)

// onNext(k) (optional): stroke k (0-based, ≥ 1) is now expected. Called once per k per attempt, as soon as a lift
// leaves the strokes before k done ("Maintenant, pars du point bleu / orange / violet !"), and again after
// NEXT_IDLE_MS without ink while still waiting there. A waiting result (r.waiting) is not a miss; a 'next' result
// that is not waiting (ink from the wrong dot) is one.
export function mountTrace(container, model, { onResult, onNext = () => {} }) {
    container.innerHTML = '<canvas class="trace-model"></canvas><canvas class="trace-ink"></canvas>';
    const [cm, ci] = container.querySelectorAll('canvas');
    const S = strokesOf(model);
    let W = 300, dprUsed = 0, strokes = [], drawing = false, activeId = null, activeType = '', mctx, ictx;
    let failTimer = null, failPending = false, graceTimer = null, idleTimer = null, cued = 0, lastResult = null, cur = 0;

    function size() {
        const r = container.getBoundingClientRect();
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        W = Math.max(200, Math.round(Math.min(r.width, r.height)));
        dprUsed = dpr;
        for (const c of [cm, ci]) { c.width = Math.round(W * dpr); c.height = Math.round(W * dpr); }
        mctx = cm.getContext('2d'); ictx = ci.getContext('2d');
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0); ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // cur: strokes already done (their dots are gone, the next one is the filled dot).
    function drawModel(done = 0) {
        cur = done;
        const s = W / 100, lg = lignageFor(model.lignage);
        mctx.clearRect(0, 0, W, W);
        // Cursive: tinted x-height band, faint ascender and descender lines, x-height line, strong baseline.
        // Capitals: cap line and baseline, faint bar guide, no band (trace-geom.js lignageFor).
        if (lg.band) { mctx.fillStyle = lg.band[2]; mctx.fillRect(0, lg.band[0] * s, W, (lg.band[1] - lg.band[0]) * s); }
        const line = (y, color, width) => { mctx.strokeStyle = color; mctx.lineWidth = width; mctx.beginPath(); mctx.moveTo(0, y * s); mctx.lineTo(W, y * s); mctx.stroke(); };
        for (const l of lg.lines) line(l.y, l.color, l.width);
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
        for (const st of S) path(st, 3.5, '#b9c6d9');
        if (model.bar) path(model.bar, 3.5, '#b9c6d9');
        if (model.dot) dot(model.dot, 3, '#b9c6d9');
        for (const st of S) arrows(st);
        // Start dots (addendum D5): the active one filled, pending ones a white ring in their colour, numbered when
        // the model has ≥ 2 strokes. Drawn last stroke first so dot 1 stays on top.
        for (const d of startDots(S, done).reverse()) {
            if (d.active) dot([d.x, d.y], 3.2, d.color);
            else {
                dot([d.x, d.y], 2.4, '#ffffff');
                mctx.strokeStyle = d.color; mctx.lineWidth = 0.8 * s;
                mctx.beginPath(); mctx.arc(d.x * s, d.y * s, 2.4 * s, 0, 7); mctx.stroke();
            }
            if (d.digit) {
                mctx.fillStyle = d.active ? '#ffffff' : d.color;
                mctx.font = `bold ${2.6 * s}px system-ui`; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
                mctx.fillText(String(d.n), d.x * s, d.y * s + 0.15 * s);
            }
        }
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
        clearTimeout(idleTimer); idleTimer = null;
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; } // lifted and came back: same attempt
        else if (failPending) clearFailed();                    // new attempt before the auto-clear fired
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
        if (r.next !== cur) drawModel(r.next);
        if (r.ok) { onResult(r); return; }
        clearTimeout(graceTimer);
        graceTimer = setTimeout(settleLift, S.length >= 2 ? MULTI_STROKE_GRACE_MS : LIFT_GRACE_MS);
        if (r.waiting && r.next > cued) { cued = r.next; onNext(r.next); }
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
        lastResult = r;
        if (!r.ok && !r.hintKey) dropStray();                  // too short to score (a tap): wipe it, it is not a miss
        if (r.waiting) {
            // The strokes so far are good, the next one has no ink yet: keep it all, cue the dot again when idle.
            idleTimer = setTimeout(() => { idleTimer = null; if (!drawing) onNext(r.next); }, NEXT_IDLE_MS);
        } else if (!r.ok && r.hintKey) {
            failPending = true;
            failTimer = setTimeout(() => { if (!drawing) clearFailed(); }, FAIL_CLEAR_MS);
        }
        onResult(r);
    }
    // After a hinted miss: keep the ink of the strokes already done (keep = 0 → everything goes), redraw the dots.
    function clearFailed() {
        const k = lastResult?.keep ?? 0;
        if (!k) { reset(); return; }
        clearTimeout(failTimer); failTimer = null; failPending = false;
        strokes = strokes.slice(0, k); redrawInk(); drawModel(lastResult.next);
    }
    function cancel(e) {
        if (!drawing || e.pointerId !== activeId) return;
        dropActiveStroke();                                      // an interrupted stroke is discarded, never scored
    }

    function reset() {
        clearTimeout(failTimer); failTimer = null; failPending = false;
        clearTimeout(graceTimer); graceTimer = null;
        clearTimeout(idleTimer); idleTimer = null;
        strokes = []; drawing = false; activeId = null; activeType = ''; cued = 0; lastResult = null;
        ictx.clearRect(0, 0, W, W); drawModel(0);
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

    return { reset, destroy() { clearTimeout(failTimer); clearTimeout(graceTimer); clearTimeout(idleTimer); window.removeEventListener('resize', onResize); container.innerHTML = ''; } };
}
