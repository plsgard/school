// tests/trace-score.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score, createPointerFilter, keepStrokes } from '../assets/gs/trace-score.js';

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
        assert.equal(r.hint, 'Pars du point vert.');
        assert.equal(r.hintKey, 'start');
    });
    test('score_StrokeFarFromModel_FailsCoverage', () => {
        // Starts on the green dot, then leaves the path downwards.
        const away = [Array.from({ length: 40 }, (_, i) => [20, 50 + i, 0.5, 'pen'])];
        const r = score(away, model);
        assert.equal(r.ok, false);
        assert.equal(r.hint, 'Suis le chemin gris.');
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
    test('score_FullCoverageButMostlyOutside_HintsInside', () => {
        // Starts on the dot, covers every waypoint, then wanders far below the corridor for too long.
        const wander = Array.from({ length: 30 }, (_, i) => [30 + i, 85, 0.5, 'pen']);
        const r = score([[...along()[0], ...wander]], model);
        assert.equal(r.startOk, true);
        assert.equal(r.coverage, 1);
        assert.ok(r.outside >= 0.25);
        assert.equal(r.hintKey, 'inside');
        assert.equal(r.hint, 'Presque\u00a0! Reste dans le chemin.');
    });
    test('score_LetterADrawnInTwoStrokes_IsOkWhenScoredTogether', () => {
        const a = letters.items.find(it => it.id === 'a').trace;
        const full = ideal(a);
        const cut = full.findIndex(p => p[0] === 66 && p[1] === 46 && full.indexOf(p) > 10); // circle closed back at the top
        const strokes = [full.slice(0, cut + 1), full.slice(cut + 1)];
        assert.equal(score(strokes, { pts: a }).ok, true);
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
    test('accept_PenAfterTouch_IsAcceptedAndLocksOutLaterTouch', () => {
        const f = createPointerFilter();
        assert.equal(f.accept('touch'), true);
        assert.equal(f.accept('pen'), true);
        assert.equal(f.accept('touch'), false);
    });
    test('accept_TouchMoreThan30sAfterLastPen_IsAcceptedAgain', () => {
        let t = 0;
        const f = createPointerFilter({ now: () => t });
        f.accept('pen');
        t = 29_000;
        assert.equal(f.accept('touch'), false);
        t = 31_000;
        assert.equal(f.accept('touch'), true);
    });
    test('accept_PenAgainAfterDecay_LocksOutTouchAgain', () => {
        let t = 0;
        const f = createPointerFilter({ now: () => t });
        f.accept('pen');
        t = 40_000;
        assert.equal(f.accept('touch'), true);
        assert.equal(f.accept('pen'), true);
        t = 41_000;
        assert.equal(f.accept('touch'), false);
    });
    test('accept_MouseAfterPen_IsAccepted', () => {
        const f = createPointerFilter();
        f.accept('pen');
        assert.equal(f.accept('mouse'), true);
    });
});

describe('keepStrokes', () => {
    test('keepStrokes_StrayTapOnly_DropsIt', () => {
        assert.deepEqual(keepStrokes([[[70, 20, 0.5, 'pen'], [70.4, 20.2, 0.5, 'pen']]], model), []);
    });
    test('keepStrokes_StrokeThatEarnedAHint_KeepsIt', () => {
        const rev = [along()[0].slice().reverse()];
        assert.equal(keepStrokes(rev, model), rev);
    });
    test('keepStrokes_StrokeThatIsOk_KeepsIt', () => {
        const ok = along();
        assert.equal(keepStrokes(ok, model), ok);
    });
    test('keepStrokes_StrayTapThenRealStroke_ScoresTheRealStrokeAlone', () => {
        const tap = [[70, 20, 0.5, 'pen']];
        assert.equal(score([tap, ...along()], model).hintKey, 'start'); // the bug: the tap became the start point
        assert.equal(score([...keepStrokes([tap], model), ...along()], model).ok, true);
    });
});

describe('TRACE_HINTS', () => {
    test('TRACE_HINTS_EveryKey_MatchesTheSpokenUiCueText', async () => {
        const { TRACE_HINTS } = await import('../assets/gs/trace-score.js');
        const { UI_CUES } = await import('../assets/gs/renderers.js');
        assert.deepEqual(Object.keys(TRACE_HINTS).sort(), Object.keys(UI_CUES.traceHint).sort());
        for (const [k, text] of Object.entries(TRACE_HINTS)) assert.equal(text, UI_CUES.traceHint[k].text, k);
    });
});
