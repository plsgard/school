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
const model = (it) => ({ pts: it.trace, ...(it.trace2 ? { pts2: it.trace2 } : {}), ...(it.dirSpan ? { dirSpan: it.dirSpan } : {}) });
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
    // Q7: an 8's two lobes turn opposite ways, so its direction is judged on its first lobe (dirSpan).
    const eight = () => model(digits.find(x => x.id === '8'));
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
});
