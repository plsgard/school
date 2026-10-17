// tests/trace-score.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score, createPointerFilter, keepStrokes, NEXT_HINTS } from '../assets/gs/trace-score.js';

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
    // Two strokes far apart (≥ 22 units): no waypoint of one is within R of the other, so each must really be drawn.
    const twoStroke = {
        pts: [[20, 72], [30, 72], [40, 72], [50, 72], [60, 72], [70, 72], [80, 72]],
        pts2: [[50, 20], [50, 25], [50, 30], [50, 35], [50, 40], [50, 45], [50, 50]],
    };
    test('score_TwoStrokeModelFirstStrokeOnly_IsNotOkAndHintsBlueDot', () => {
        const r = score([ideal(twoStroke.pts)], twoStroke);
        assert.equal(r.ok, false);
        assert.equal(r.hintKey, 'next');
        assert.equal(r.next, 1);
        assert.equal(r.hint, NEXT_HINTS[1]);
    });
    test('score_TwoStrokeModelSecondStrokeOnly_IsNotOk', () => {
        const r = score([ideal(twoStroke.pts2)], twoStroke);
        assert.equal(r.ok, false);
        assert.equal(r.hintKey, 'start');
    });
    test('score_TwoStrokeModelBothStrokes_IsOk', () => {
        assert.equal(score([ideal(twoStroke.pts), ideal(twoStroke.pts2)], twoStroke).ok, true);
    });
    // Closed model (0, 8): start and end share the green dot, so direction is told by the signed area.
    const ring = Array.from({ length: 17 }, (_, i) => [50 + 20 * Math.sin(-i * Math.PI / 8), 50 - 20 * Math.cos(i * Math.PI / 8)]);
    test('score_ClosedModelReversed_HintsArrows', () => {
        const r = score([ideal(ring).slice().reverse()], { pts: ring });
        assert.equal(r.startOk, true);
        assert.equal(r.ok, false);
        assert.equal(r.hintKey, 'arrows');
        assert.equal(r.hint, 'Suis les flèches.');
    });
    test('score_ClosedModelRightDirection_IsOk', () => {
        assert.equal(score([ideal(ring)], { pts: ring }).ok, true);
    });
    for (const off of [8, 10]) {
        test(`score_ClosedModelStartOffset${off}TowardTheEnd_IsOk`, () => {
            const [s0, e] = [ring[0], ring[ring.length - 3]];
            const k = off / Math.hypot(e[0] - s0[0], e[1] - s0[1]);
            const start = [s0[0] + (e[0] - s0[0]) * k, s0[1] + (e[1] - s0[1]) * k];
            const r = score([ideal([start, ...ring])], { pts: ring });
            assert.equal(r.ok, true, JSON.stringify(r));
        });
    }
    test('score_ClosedModelOneStepWobbleAtStart_IsOk', () => {
        const r = score([ideal([ring[0], ring[ring.length - 2], ...ring])], { pts: ring });
        assert.equal(r.ok, true, JSON.stringify(r));
    });
    test('score_ClosedModelOvershoot_IsOk', () => {
        const r = score([ideal([...ring, ring[1], ring[2], ring[3]])], { pts: ring });
        assert.equal(r.ok, true, JSON.stringify(r));
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
    test('keepStrokes_TapsOnly_ReturnsEmpty', () => {
        const taps = [[[70, 20, 0.5, 'pen'], [70.4, 20.2, 0.5, 'pen']], [[30, 60, 0.5, 'pen'], [30.5, 60, 0.5, 'pen']]];
        assert.deepEqual(keepStrokes(taps, model), []);
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
    test('TRACE_HINTS_NextHints_MatchTheSpokenUiCueTexts', async () => {
        const { UI_CUES } = await import('../assets/gs/renderers.js');
        for (const k of [1, 2, 3]) assert.equal(NEXT_HINTS[k], UI_CUES.traceNext[k].text, String(k));
        assert.equal(UI_CUES.traceNext[1].key, 'ui.trace-blue');
        assert.equal(UI_CUES.traceNext[1].text, 'Maintenant, pars du point bleu\u00a0!');
    });
});
describe('score (two-stroke x)', () => {
    const x = letters.items.find(it => it.id === 'x');
    const m = { pts: x.trace, pts2: x.trace2 };
    test('score_GreenStrokeOnlyOnTwoStrokeModel_WaitsForStroke1', () => {
        const r = score([ideal(x.trace)], m);
        assert.equal(r.waiting && r.next === 1, true);
    });
    test('score_BothStrokesDrawn_IsOk', () => {
        assert.equal(score([ideal(x.trace), ideal(x.trace2)], m).ok, true);
    });
    test('score_HalfOfTheGreenStroke_HintsFollowNotWaiting', () => {
        const r = score([ideal(x.trace.slice(0, 5))], m);
        assert.equal(r.hintKey, 'follow');
        assert.equal(r.waiting, false);
    });
    test('score_GreenStrokeDoneBlueMissing_HintsBlueDot', () => {
        const r = score([ideal(x.trace)], m);
        assert.equal(r.ok, false);
        assert.equal(r.hintKey, 'next');
        assert.equal(r.next, 1);
        assert.equal(r.hint, 'Maintenant, pars du point bleu !');
        assert.equal(r.hint, NEXT_HINTS[1]);
    });
    test('score_GreenStrokeHalfDoneOnTwoStrokeModel_HintsFollow', () => {
        assert.equal(score([ideal(x.trace.slice(0, 5))], m).hintKey, 'follow');
    });
    test('score_OneStrokeModel_NeverNext', () => {
        const a = letters.items.find(it => it.id === 'a').trace;
        for (const ink of [[ideal(a)], [ideal(a.slice(0, 6))], [ideal(a).slice().reverse()]]) {
            const r = score(ink, { pts: a });
            assert.notEqual(r.hintKey, 'next');
            assert.equal(r.waiting, false);
        }
    });
});

describe('score (N strokes)', () => {
    const tri = { strokes: [
        [[20, 20], [20, 30], [20, 40], [20, 50], [20, 60], [20, 70]],
        [[45, 20], [45, 30], [45, 40], [45, 50], [45, 60], [45, 70]],
        [[70, 20], [70, 30], [70, 40], [70, 50], [70, 60], [70, 70]],
    ] };
    const I = tri.strokes.map(ideal);
    const tap = [[90, 90, 0.5, 'pen'], [90.3, 90.2, 0.5, 'pen']];
    test('score_ThreeStrokesInOrder_IsOk', () => {
        const r = score(I, tri);
        assert.equal(r.ok, true);
        assert.equal(r.next, 3);
    });
    test('score_FirstStrokeDoneOnly_WaitsForStroke1WithBlueHint', () => {
        const r = score([I[0]], tri);
        assert.deepEqual([r.hintKey, r.next, r.waiting, r.hint, r.keep], ['next', 1, true, NEXT_HINTS[1], 1]);
    });
    test('score_TwoStrokesDone_WaitsForStroke2WithOrangeHint', () => {
        const r = score([I[0], I[1]], tri);
        assert.deepEqual([r.hintKey, r.next, r.waiting, r.hint, r.keep], ['next', 2, true, NEXT_HINTS[2], 2]);
    });
    test('score_ThreeOfFourStrokesDone_WaitsForStroke3WithVioletHint', () => {
        const four = { strokes: [...tri.strokes, [[20, 80], [35, 80], [50, 80], [65, 80]]] };
        const r = score(I, four);
        assert.deepEqual([r.hintKey, r.next, r.waiting, r.hint], ['next', 3, true, NEXT_HINTS[3]]);
        assert.equal(NEXT_HINTS[3], 'Maintenant, pars du point violet !');
        assert.equal(NEXT_HINTS[2], 'Maintenant, pars du point orange !');
    });
    test('score_FirstDoneThenThirdDrawn_NextNotWaiting', () => {
        const r = score([I[0], I[2]], tri);
        assert.deepEqual([r.hintKey, r.next, r.waiting, r.keep], ['next', 1, false, 1]);
        assert.equal(r.hint, NEXT_HINTS[1]);
    });
    test('score_SecondStrokeDrawnFirst_HintsStart', () => {
        const r = score([I[1], I[0], I[2]], tri);
        assert.equal(r.hintKey, 'start');
        assert.equal(r.keep, 0);
    });
    test('score_StrokeStoppingShortOfItsEnd_HintsFollow', () => {
        const r = score([I[0], I[1].slice(0, -9), I[2]], tri);
        assert.equal(r.hintKey, 'follow');
        assert.equal(r.next, 1);
    });
    test('score_StrayTapBetweenStrokes_IsIgnored', () => {
        assert.equal(score([I[0], tap, I[1], I[2]], tri).ok, true);
    });
    test('score_StrayTapBeforeRealStroke_IsIgnored', () => {
        assert.equal(score([tap, ...along()], model).ok, true);
    });
    test('score_MidStrokeLift_ContinuesTheSameStroke', () => {
        assert.equal(score([I[0].slice(0, 25), I[0].slice(25), I[1], I[2]], tri).ok, true);
    });
    test('score_ClosedFirstStrokeReversed_HintsArrows', () => {
        const ring = Array.from({ length: 17 }, (_, i) => [50 + 20 * Math.sin(-i * Math.PI / 8), 50 - 20 * Math.cos(i * Math.PI / 8)]);
        const tail = [[60, 80], [66, 84], [72, 88], [78, 92]];
        const r = score([ideal(ring).reverse(), ideal(tail)], { strokes: [ring, tail] });
        assert.equal(r.hintKey, 'arrows');
    });
    test('score_LegacyTwoStrokeShape_SameAsStrokes', () => {
        const [a, b] = [tri.strokes[0], tri.strokes[2]];
        for (const ink of [[ideal(a)], [ideal(a), ideal(b)], [ideal(b), ideal(a)]]) {
            assert.deepEqual(score(ink, { pts: a, pts2: b }), score(ink, { strokes: [a, b] }));
        }
    });
    test('score_WaitingResult_KeepCountsDoneStrokesOnly', () => {
        assert.equal(score([I[0], I[1].slice(0, 20)], tri).keep, 1);
        assert.equal(score([I[0], I[1], I[2].slice(0, 20)], tri).keep, 2);
    });
    test('score_AllStrokesDoneButOutside_KeepsNothing', () => {
        const wander = ideal([[70, 70], [90, 95], [60, 95], [90, 92], [40, 95]]);
        const r = score([I[0], I[1], [...I[2], ...wander]], tri);
        assert.deepEqual([r.ok, r.hintKey, r.keep], [false, 'inside', 0]);
    });
    test('score_RedrawAfterAnInsideMiss_IsOk', () => {
        const a = letters.items.find(it => it.id === 'a').trace, ma = { pts: a };
        const badA = [[...ideal(a), ...ideal([a.at(-1), [90, 30], [95, 90], [85, 20], [95, 85]])]];
        const ra = score(badA, ma);
        assert.equal(ra.hintKey, 'inside');
        assert.equal(score([...badA.slice(0, ra.keep), ideal(a)], ma).ok, true);
        const E = letters.items.find(it => it.id === 'e').capTrace, me = { strokes: E }, IE = E.map(ideal);
        const badE = [...IE.slice(0, 3), [...IE[3], ...ideal([[70, 72], [90, 95], [60, 95], [90, 92], [40, 95]])]];
        const re = score(badE, me);
        assert.equal(re.hintKey, 'inside');
        assert.equal(score([...badE.slice(0, re.keep), ...IE], me).ok, true);
    });
    // Q12: a corner (end of stroke k = start of stroke k + 1) may be drawn without lifting the pen.
    const L = { strokes: [
        [[30, 16], [30, 24], [30, 32], [30, 40], [30, 48], [30, 56], [30, 64], [30, 72]],
        [[30, 72], [37.5, 72], [45, 72], [53, 72], [60.5, 72], [68, 72]],
    ] };
    test('score_CornerDrawnInOneContinuousStroke_IsOk', () => {
        const one = ideal([...L.strokes[0], ...L.strokes[1].slice(1)]);
        const r = score([one], L);
        assert.equal(r.ok, true, JSON.stringify(r));
    });
    test('score_CornerDrawnAsTwoStrokes_IsOk', () => {
        assert.equal(score(L.strokes.map(ideal), L).ok, true);
    });
    test('score_CornerDrawnFromTheBarEnd_HintsStart', () => {
        const back = ideal([...L.strokes[0], ...L.strokes[1].slice(1)]).reverse();
        assert.equal(score([back], L).hintKey, 'start');
    });
    test('score_ContinuousStrokeStoppingHalfwayAlongTheSecond_KeepsTheFirst', () => {
        const part = ideal([...L.strokes[0], ...L.strokes[1].slice(1, 3)]);
        const r = score([part], L);
        assert.deepEqual([r.ok, r.next, r.hintKey], [false, 1, 'follow']);
    });
});
