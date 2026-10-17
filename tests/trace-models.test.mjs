// tests/trace-models.test.mjs
// One place for the trace-model rules (spec §8.3): every shipped model is drawable, ideal stroke passes,
// reversed stroke fails, and loops / descenders reach their lignage lines.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score } from '../assets/gs/trace-score.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const letters = (await load('letters')).items;
const digits = (await load('numbers')).items.filter(it => it.n <= 9);
const ideal = (wp) => {
    const out = [];
    for (let i = 0; i < wp.length - 1; i++) {
        const [a, b] = [wp[i], wp[i + 1]];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 0.5, 'pen']);
    }
    out.push([...wp[wp.length - 1], 0.5, 'pen']);
    return out;
};
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const model = (it) => ({ pts: it.trace, ...(it.trace2 ? { pts2: it.trace2 } : {}), ...(it.dirOrder ? { dirOrder: it.dirOrder } : {}) });
const isClosed = (pts) => d(pts[0], pts[pts.length - 1]) < 12.6;

function checkModel(it, label) {
    const m = model(it);
    for (const [x, y] of [...m.pts, ...(m.pts2 ?? [])]) {
        assert.ok(x >= 4 && x <= 96 && y >= 14 && y <= 94, `${label}: point ${x},${y} out of the box`);
    }
    for (const stroke of [m.pts, m.pts2].filter(Boolean)) {
        assert.ok(stroke.length >= 2, label);
        for (let i = 1; i < stroke.length; i++) assert.ok(d(stroke[i - 1], stroke[i]) <= 20, `${label}: gap ${i}`);
    }
    assert.ok(m.pts.length >= 10 && m.pts.length <= 26, `${label}: ${m.pts.length} waypoints`);
    const strokes = [ideal(m.pts), ...(m.pts2 ? [ideal(m.pts2)] : [])];
    assert.equal(score(strokes, m).ok, true, `${label}: ideal stroke`);
    const reversed = [ideal(m.pts).slice().reverse(), ...strokes.slice(1)];
    if (isClosed(m.pts)) {
        assert.ok(d(m.pts[2], m.pts[0]) >= 12 && d(m.pts[2], m.pts[m.pts.length - 3]) >= 18, `${label}: closed-shape check points`);
        assert.equal(score(reversed, m).hintKey, 'arrows', `${label}: reversed closed`);
    } else {
        assert.ok(d(m.pts[0], m.pts[m.pts.length - 1]) >= 15, `${label}: start and end too close`);
        assert.equal(score(reversed, m).startOk, false, `${label}: reversed`);
    }
    if (m.pts2) {
        assert.equal(score([ideal(m.pts)], m).ok, false, `${label}: first stroke alone`);
        // Q6: the blue stroke is a real stroke of its own, and its blue dot is not hidden under the green one.
        assert.ok(m.pts2.length >= 7, `${label}: blue stroke has ${m.pts2.length} waypoints`);
        assert.ok(d(m.pts2[0], m.pts[0]) >= 8, `${label}: blue dot under the green dot`);
        const onStroke1 = m.pts2.filter(w => ideal(m.pts).some(p => d(p, w) < 9)).length / m.pts2.length;
        assert.ok(onStroke1 <= 0.5, `${label}: blue stroke lies on the green one (${onStroke1})`);
        for (const w of m.pts2.slice(-2)) assert.ok(!ideal(m.pts).some(p => d(p, w) < 9), `${label}: blue stroke ends on the green one`);
        const blueFirst = [ideal(m.pts2), ideal(m.pts)];
        assert.equal(score(blueFirst, m).hintKey, 'start', `${label}: blue stroke first`);
        const half = ideal(m.pts2).slice(0, Math.ceil(ideal(m.pts2).length / 2));
        assert.equal(score([ideal(m.pts), half], m).ok, false, `${label}: half of the blue stroke`);
    }
}

describe('traceModels', () => {
    test('traceModels_EveryLetter_HasAModel', () => {
        assert.deepEqual(letters.filter(l => !l.trace).map(l => l.id), []);
    });
    test('traceModels_EveryLetterModel_IdealOkReversedFailsWithinTheBox', () => {
        for (const l of letters) checkModel(l, `letter ${l.id}`);
    });
    test('traceModels_SecondStroke_OnlyOnXFourFive', () => {
        assert.deepEqual(letters.filter(l => l.trace2).map(l => l.id), ['x']);
    });
    test('traceModels_LoopsAndDescenders_ReachTheirLines', () => {
        const top = (l) => Math.min(...l.trace.map(p => p[1])), bottom = (l) => Math.max(...l.trace.map(p => p[1]));
        for (const id of 'bfhkl') assert.ok(top(letters.find(l => l.id === id)) <= 20, `${id} loop`);
        for (const id of 'fgjpqyz') assert.ok(bottom(letters.find(l => l.id === id)) >= 86, `${id} descender`);
        for (const id of 'td') { const t = top(letters.find(l => l.id === id)); assert.ok(t >= 26 && t <= 34, `${id} hampe ${t}`); }
    });
    test('traceModels_EveryDigit_HasAModelIdealOkReversedFails', () => {
        assert.deepEqual(digits.filter(x => !x.trace).map(x => x.id), []);
        for (const x of digits) checkModel(x, `digit ${x.id}`);
    });
    test('traceModels_ClosedDigits_AreZeroAndEight', () => {
        assert.deepEqual(digits.filter(x => isClosed(x.trace)).map(x => x.id).sort(), ['0', '8']);
    });
    test('traceModels_TwoStrokeDigits_AreFourAndFive', () => {
        assert.deepEqual(digits.filter(x => x.trace2).map(x => x.id).sort(), ['4', '5']);
    });
    test('traceModels_Digits_TopOnHampeAndSitOnBaseline', () => {
        for (const x of digits) {
            const ys = [...x.trace, ...(x.trace2 ?? [])].map(p => p[1]);
            assert.ok(Math.min(...ys) >= 28 && Math.min(...ys) <= 33, `${x.id} top`);
            assert.ok(Math.max(...ys) >= 70 && Math.max(...ys) <= 74, `${x.id} bottom`);
        }
    });
    // An 8's two lobes turn opposite ways; drawn backwards from the green dot it turns the same ways too. Its
    // direction is judged by order of reach (top band left of the start before the bottom band), whatever the lobe sizes.
    const eight = () => model(digits.find(x => x.id === '8'));
    // A synthetic 8 whose top lobe takes `r` of the height (30–72), drawn as taught: start top right, top lobe
    // counter-clockwise, bottom lobe clockwise, back up through the centre.
    const eightOf = (r) => {
        const h = 42, ry1 = r * h / 2, ry2 = (1 - r) * h / 2, ct = [50, 30 + ry1], cb = [50, 30 + 2 * ry1 + ry2];
        const top = (deg) => [ct[0] + 0.8 * ry1 * Math.sin(deg * Math.PI / 180), ct[1] - ry1 * Math.cos(deg * Math.PI / 180)];
        const bot = (deg) => [cb[0] + 0.8 * ry2 * Math.sin(deg * Math.PI / 180), cb[1] - ry2 * Math.cos(deg * Math.PI / 180)];
        const pts = [];
        for (let a = 45; a >= -180; a -= 22.5) pts.push(top(a));
        for (let a = 30; a < 360; a += 30) pts.push(bot(a));
        for (let a = -180; a >= -315; a -= 22.5) pts.push(top(a));
        return { pts: pts.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]), dirOrder: 'top-first' };
    };
    test('traceModels_EightDrawnAsTaught_IsOk', () => {
        assert.equal(score([ideal(eight().pts)], eight()).ok, true);
    });
    test('traceModels_EightFullyReversed_HintsArrows', () => {
        assert.equal(score([ideal(eight().pts).slice().reverse()], eight()).hintKey, 'arrows');
    });
    test('traceModels_EightStartOffsetTowardTheEnd_IsOk', () => {
        const m = eight(), [s0, e] = [m.pts[0], m.pts[m.pts.length - 3]];
        const k = 8 / d(s0, e), start = [s0[0] + (e[0] - s0[0]) * k, s0[1] + (e[1] - s0[1]) * k];
        assert.equal(score([ideal([start, ...m.pts])], m).ok, true);
    });
    for (const r of [0.35, 0.45, 0.6]) {
        test(`traceModels_EightTopLobe${r * 100}PercentAsTaught_IsOk`, () => {
            const m = eightOf(r);
            assert.equal(score([ideal(m.pts)], m).ok, true, JSON.stringify(score([ideal(m.pts)], m)));
        });
        test(`traceModels_EightTopLobe${r * 100}PercentReversed_HintsArrows`, () => {
            const m = eightOf(r);
            assert.equal(score([ideal(m.pts).slice().reverse()], m).hintKey, 'arrows');
        });
    }
    test('traceModels_EightTopLobeClockwiseFirst_HintsArrows', () => {
        // top band reached first, but the top lobe goes round the wrong way (clockwise) before the bottom one
        const m = eightOf(0.45), r = 0.45, ry1 = r * 21, ry2 = (1 - r) * 21, ct = [50, 30 + ry1], cb = [50, 30 + 2 * ry1 + ry2];
        const at = (c, ry, deg) => [c[0] + 0.8 * ry * Math.sin(deg * Math.PI / 180), c[1] - ry * Math.cos(deg * Math.PI / 180)];
        const ink = [];
        for (let a = 45; a <= 405 + 135; a += 22.5) ink.push(at(ct, ry1, a));  // full top loop clockwise, then down the right
        for (let a = 0; a >= -360; a -= 30) ink.push(at(cb, ry2, a));          // bottom loop counter-clockwise
        for (let a = 180; a <= 225; a += 22.5) ink.push(at(ct, ry1, a));      // back up through the centre
        assert.equal(score([ideal(ink)], m).hintKey, 'arrows');
    });
});
