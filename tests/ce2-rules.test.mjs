// tests/ce2-rules.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MASTERY, ce2Settings, ladderOf, recordProblem, setLevel, composeSession, shouldStop, stars, cardId, SESSION_MS,
} from '../assets/ce2/rules.js';

const day = '2026-10-23';
const empty = () => ({ cards: {}, introduced: {} });
const play = (srs, outcomes, { level, unlocked = [], review = false } = {}) => {
    for (const outcome of outcomes) {
        srs = recordProblem(srs, { level: level ?? ladderOf(srs, unlocked).level, outcome, review }, day, unlocked);
    }
    return srs;
};

describe('ce2Settings', () => {
    test('ce2Settings_Defaults_EightGuidedWithProof', () => {
        assert.deepEqual(ce2Settings({}), { items: 8, mode: 'guided', proof: true, unlocked: [] });
    });
    test('ce2Settings_OutOfRange_Clamped', () => {
        assert.equal(ce2Settings({ ce2Items: 50 }).items, 10);
        assert.equal(ce2Settings({ ce2Items: 1 }).items, 6);
        assert.equal(ce2Settings({ ce2Items: 'x' }).items, 8);
    });
    test('ce2Settings_StoredValues_Read', () => {
        assert.deepEqual(ce2Settings({ ce2Mode: 'solo', ce2Proof: false, ce2Unlocked: [7, 99] }),
            { items: 8, mode: 'solo', proof: false, unlocked: [7] });
    });
});

describe('ladder', () => {
    test('ladderOf_Nothing_StartsAtLevelOne', () => {
        assert.deepEqual(ladderOf(empty(), []), { level: 1, streak: 0, misses: 0 });
    });
    test('recordProblem_FourCleanInARow_MastersAndMovesUp', () => {
        let srs = setLevel(empty(), 2);
        srs = play(srs, Array(MASTERY - 1).fill('clean'));
        assert.deepEqual(ladderOf(srs, []), { level: 2, streak: MASTERY - 1, misses: 0 });
        srs = play(srs, ['clean']);
        assert.deepEqual(ladderOf(srs, []), { level: 3, streak: 0, misses: 0 });
        assert.ok(srs.cards[cardId(2)]);
    });
    test('recordProblem_Fixed_ResetsStreakWithoutMiss', () => {
        const srs = play(empty(), ['clean', 'clean', 'fixed']);
        assert.deepEqual(ladderOf(srs, []), { level: 1, streak: 0, misses: 0 });
    });
    test('recordProblem_TwoMissesInARow_DropsOneLevel', () => {
        const srs = play(setLevel(empty(), 4), ['missed', 'missed']);
        assert.deepEqual(ladderOf(srs, []), { level: 3, streak: 0, misses: 0 });
    });
    test('recordProblem_MissThenClean_ResetsMisses', () => {
        const srs = play(setLevel(empty(), 4), ['missed', 'clean', 'missed']);
        assert.deepEqual(ladderOf(srs, []), { level: 4, streak: 0, misses: 1 });
    });
    test('recordProblem_FixedBetweenMisses_StillTwoInARow', () => {
        const srs = play(setLevel(empty(), 4), ['missed', 'fixed', 'missed']);
        assert.equal(ladderOf(srs, []).level, 3);
    });
    test('recordProblem_MissesAtLevelOne_StaysAtOne', () => {
        assert.equal(ladderOf(play(empty(), ['missed', 'missed', 'missed']), []).level, 1);
    });
    test('recordProblem_MasterLevel6WithLevel7Locked_SkipsTo8WhenUnlocked', () => {
        const srs = play(setLevel(empty(), 6), Array(MASTERY).fill('clean'), { unlocked: [8] });
        assert.equal(ladderOf(srs, [8]).level, 8);
    });
    test('recordProblem_MasterLevel6WithBothLocked_StaysAt6', () => {
        const srs = play(setLevel(empty(), 6), Array(MASTERY).fill('clean'));
        assert.deepEqual(ladderOf(srs, []), { level: 6, streak: 0, misses: 0 });
        assert.ok(srs.cards[cardId(6)]);
    });
    test('recordProblem_PullBackOver7Locked_LandsOn6', () => {
        const srs = play(setLevel(empty(), 8), ['missed', 'missed'], { unlocked: [8] });
        assert.equal(ladderOf(srs, [8]).level, 6);
    });
    test('recordProblem_Review_UpdatesCardNotLadder', () => {
        let srs = play(setLevel(empty(), 2), Array(MASTERY).fill('clean'));
        const before = srs.cards[cardId(2)];
        srs = recordProblem(srs, { level: 2, outcome: 'missed', review: true }, day, []);
        assert.deepEqual(ladderOf(srs, []), { level: 3, streak: 0, misses: 0 });
        assert.equal(srs.cards[cardId(2)].lapses, before.lapses + 1);
    });
    test('recordProblem_AnyCall_DoesNotMutateInput', () => {
        const srs = setLevel(empty(), 2);
        const copy = structuredClone(srs);
        play(srs, ['clean', 'missed']);
        assert.deepEqual(srs, copy);
    });
    test('ladderOf_CurrentLevelLocked_FallsBackBelow', () => {
        assert.equal(ladderOf(setLevel(empty(), 7), []).level, 6);
        assert.equal(ladderOf(setLevel(empty(), 8), [7]).level, 7);
    });
});

describe('session', () => {
    const due = (levels, current) => {
        const srs = setLevel(empty(), current);
        for (const l of levels) srs.cards[cardId(l)] = { box: 2, due: '2026-10-20', seen: 4, lapses: 0 };
        return srs;
    };
    test('composeSession_DueMasteredLevels_TwoReviewsNotFirst', () => {
        const plan = composeSession({ srs: due([1, 2, 3], 4), today: day, items: 8, unlocked: [] });
        assert.equal(plan.length, 8);
        assert.equal(plan[0], null);
        assert.equal(plan.filter(x => x !== null).length, 2);
        assert.deepEqual(plan.map((x, i) => (x === null ? null : i)).filter(i => i !== null), [2, 4]);
    });
    test('composeSession_NothingDue_AllCurrent', () => {
        const srs = due([], 3);
        srs.cards[cardId(1)] = { box: 3, due: '2026-11-30', seen: 4, lapses: 0 };
        assert.deepEqual(composeSession({ srs, today: day, items: 6, unlocked: [] }), Array(6).fill(null));
    });
    test('composeSession_DueCardOfCurrentLevel_NotAReview', () => {
        assert.deepEqual(composeSession({ srs: due([4], 4), today: day, items: 6, unlocked: [] }), Array(6).fill(null));
    });
    test('shouldStop_TenMinutesElapsed_Stops', () => {
        assert.equal(shouldStop({ index: 3, items: 8, startedAt: 0, now: SESSION_MS }), true);
        assert.equal(shouldStop({ index: 3, items: 8, startedAt: 0, now: SESSION_MS - 1 }), false);
        assert.equal(shouldStop({ index: 8, items: 8, startedAt: 0, now: 0 }), true);
    });
    test('stars_Outcomes_CountsCleanOnly', () => {
        assert.equal(stars(['clean', 'fixed', 'missed', 'clean']), 2);
    });
});
