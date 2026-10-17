// tests/trace-score.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score, createPointerFilter } from '../assets/gs/trace-score.js';

const model = { pts: [[20, 50], [40, 50], [60, 50], [80, 50]] };
const letters = JSON.parse(await readFile(new URL('../assets/gs/decks/letters.json', import.meta.url), 'utf8'));
// Dense ideal stroke following the waypoints (one point per unit of length).
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
const along = (dy = 0, from = 18) => [Array.from({ length: 40 }, (_, i) => [from + i * 1.6, 50 + dy, 0.5, 'pen'])];

describe('score', () => {
    test('score_StrokeAlongModel_IsOk', () => {
        const r = score(along(), model);
        assert.equal(r.ok, true);
        assert.ok(r.coverage >= 0.85);
    });
    test('score_StrokeStartingAtTheEnd_FailsStart', () => {
        const rev = [along()[0].slice().reverse()];
        const r = score(rev, model);
        assert.equal(r.startOk, false);
        assert.equal(r.hint, 'Pars du point vert');
        assert.equal(r.hintKey, 'start');
    });
    test('score_StrokeFarFromModel_FailsCoverage', () => {
        // Starts on the green dot, then leaves the path downwards.
        const away = [Array.from({ length: 40 }, (_, i) => [20, 50 + i, 0.5, 'pen'])];
        const r = score(away, model);
        assert.equal(r.ok, false);
        assert.equal(r.hint, 'Suis le chemin gris');
        assert.equal(r.hintKey, 'follow');
    });
    test('score_IdealStrokeForEveryShippedLetter_IsOk', () => {
        const traced = letters.items.filter(it => it.trace);
        assert.ok(traced.length > 0);
        for (const it of traced) {
            const stroke = ideal(it.trace);
            assert.equal(score([stroke], { pts: it.trace }).ok, true, `ideal ${it.id}`);
            assert.equal(score([stroke.slice().reverse()], { pts: it.trace }).startOk, false, `reversed ${it.id}`);
        }
    });
    test('score_TooFewPoints_IsNotOkWithoutHint', () => {
        const r = score([[[20, 50, 0.5, 'pen']]], model);
        assert.equal(r.ok, false);
        assert.equal(r.hint, '');
    });
});

describe('createPointerFilter', () => {
    test('accept_TouchBeforeAnyPen_IsAccepted', () => {
        assert.equal(createPointerFilter().accept('touch'), true);
    });
    test('accept_TouchAfterPen_IsRejected', () => {
        const f = createPointerFilter();
        f.accept('pen');
        assert.equal(f.accept('touch'), false);
        assert.equal(f.accept('pen'), true);
    });
});
