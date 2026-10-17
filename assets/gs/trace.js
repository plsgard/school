// assets/gs/trace.js
// Two canvases: model (grid, grey corridor, start dot, arrows) and ink. Pointer Events, Pencil pressure.
import { score, createPointerFilter } from './trace-score.js';

export function mountTrace(container, model, { onResult }) {
    container.innerHTML = '<canvas class="trace-model"></canvas><canvas class="trace-ink"></canvas>';
    const [cm, ci] = container.querySelectorAll('canvas');
    const filter = createPointerFilter();
    let W = 300, strokes = [], drawing = false, activeId = null, mctx, ictx;

    function size() {
        const r = container.getBoundingClientRect();
        W = Math.max(200, Math.round(Math.min(r.width, r.height)));
        for (const c of [cm, ci]) { c.width = W * 2; c.height = W * 2; }
        mctx = cm.getContext('2d'); ictx = ci.getContext('2d');
        mctx.setTransform(2, 0, 0, 2, 0, 0); ictx.setTransform(2, 0, 0, 2, 0, 0);
    }

    function drawModel() {
        const s = W / 100;
        mctx.clearRect(0, 0, W, W);
        mctx.strokeStyle = '#dfe7f2'; mctx.lineWidth = 1;
        for (const y of [30, 50, 70]) { mctx.beginPath(); mctx.moveTo(0, y * s); mctx.lineTo(W, y * s); mctx.stroke(); }
        const path = (pts, width, color) => {
            mctx.strokeStyle = color; mctx.lineWidth = width * s; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
            mctx.beginPath(); mctx.moveTo(pts[0][0] * s, pts[0][1] * s);
            for (const [x, y] of pts.slice(1)) mctx.lineTo(x * s, y * s);
            mctx.stroke();
        };
        path(model.pts, 3.5, '#b9c6d9');
        if (model.bar) path(model.bar, 3.5, '#b9c6d9');
        if (model.dot) { mctx.fillStyle = '#b9c6d9'; mctx.beginPath(); mctx.arc(model.dot[0] * s, model.dot[1] * s, 3 * s, 0, 7); mctx.fill(); }
        mctx.fillStyle = '#8fa3c2';
        for (let i = 3; i < model.pts.length; i += 4) {
            const [a, b] = [model.pts[i - 1], model.pts[i]];
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
            mctx.save(); mctx.translate(b[0] * s, b[1] * s); mctx.rotate(ang);
            mctx.beginPath(); mctx.moveTo(0, 0); mctx.lineTo(-2.2 * s, -1.6 * s); mctx.lineTo(-2.2 * s, 1.6 * s); mctx.closePath(); mctx.fill(); mctx.restore();
        }
        mctx.fillStyle = '#4cb944'; mctx.beginPath(); mctx.arc(model.pts[0][0] * s, model.pts[0][1] * s, 3.2 * s, 0, 7); mctx.fill();
    }

    const pos = (e) => { const r = ci.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100, e.pressure || 0.5, e.pointerType]; };

    function down(e) {
        if (drawing || !filter.accept(e.pointerType)) return;
        e.preventDefault(); drawing = true; activeId = e.pointerId; ci.setPointerCapture(e.pointerId); strokes.push([pos(e)]);
    }
    function move(e) {
        if (!drawing || e.pointerId !== activeId) return;
        e.preventDefault();
        const p = pos(e), st = strokes[strokes.length - 1], q = st[st.length - 1];
        st.push(p);
        const s = W / 100;
        ictx.strokeStyle = '#223252'; ictx.lineCap = 'round';
        ictx.lineWidth = (p[3] === 'pen' ? 2 + p[2] * 6 : 5) * s / 2.2;
        ictx.beginPath(); ictx.moveTo(q[0] * s, q[1] * s); ictx.lineTo(p[0] * s, p[1] * s); ictx.stroke();
    }
    // Only the pointer that started the stroke ends it: a rejected palm lifting mid-stroke must not score.
    function up(e) {
        if (!drawing || e.pointerId !== activeId) return;
        drawing = false; activeId = null;
        onResult(score(strokes, model));
    }

    function reset() { strokes = []; drawing = false; activeId = null; ictx.clearRect(0, 0, W, W); drawModel(); }
    const onResize = () => { size(); reset(); };

    size(); reset();
    ci.addEventListener('pointerdown', down);
    ci.addEventListener('pointermove', move);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ci.addEventListener(ev, up);
    window.addEventListener('resize', onResize);

    return { reset, destroy() { window.removeEventListener('resize', onResize); container.innerHTML = ''; } };
}
