import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, pickFormat, topLevel, startLevel, isMastered, initial, levelOf, FAST_MS } from '../assets/en/ladder.js';

const ID = 'l-days/monday#write';
const empty = () => ({ cards: {}, formats: {} });
const withState = (state) => ({ cards: { [ID]: { ...initial('spell'), ...state } }, formats: {} });
const answer = (learn, a, kind = 'spell') => applyAnswer(learn, ID, kind, { ms: 60000, format: 'type', typed: '', today: '2026-11-11', top: topLevel(kind, true), ...a });

describe('levels', () => {
    test('startLevel_PerKind_SpellOneWriteTwo', () => {
        assert.deepEqual([startLevel('spell'), startLevel('write')], [1, 2]);
    });
    test('topLevel_WriteWithoutVoice_Three', () => {
        assert.deepEqual([topLevel('spell', true), topLevel('write', true), topLevel('write', false)], [3, 4, 3]);
    });
    test('levelOf_StoredAboveTop_CappedAtTop', () => {
        assert.equal(levelOf({ lvl: 4 }, 'write', 3), 3);
        assert.equal(levelOf(undefined, 'write', 4), 2);
    });
});

describe('applyAnswer', () => {
    test('applyAnswer_RightSlow_UpOneLevel', () => {
        const s = answer(empty(), { result: 'right', format: 'pick' }).cards[ID];
        assert.equal(s.lvl, 2);
        assert.equal(s.passed, 1);
    });
    test('applyAnswer_RightFast_SkipsALevelCappedAtTop', () => {
        assert.equal(answer(empty(), { result: 'right', ms: FAST_MS[1] - 1, format: 'pick' }).cards[ID].lvl, 3);
        assert.equal(answer(withState({ lvl: 2 }), { result: 'right', ms: 10, format: 'fill' }).cards[ID].lvl, 3);
    });
    test('applyAnswer_RightAtTop_RecordsTheDayOnce', () => {
        let l = answer(withState({ lvl: 3 }), { result: 'right' });
        l = answer(l, { result: 'right' });
        assert.deepEqual(l.cards[ID].topDays, ['2026-11-11']);
        assert.equal(l.cards[ID].lvl, 3);
    });
    test('applyAnswer_Retry_KeepsLevel', () => {
        const s = answer(withState({ lvl: 2, miss: 1, alt: true }), { result: 'retry' }).cards[ID];
        assert.deepEqual([s.lvl, s.miss, s.alt, s.passed], [2, 1, true, 0]);
    });
    test('applyAnswer_FirstMiss_StaysAndFlagsOtherFormat', () => {
        const s = answer(withState({ lvl: 2 }), { result: 'miss' }).cards[ID];
        assert.deepEqual([s.lvl, s.miss, s.alt], [2, 1, true]);
    });
    test('applyAnswer_SecondMissInARow_DropsOneLevelNotBelowStart', () => {
        const s = answer(withState({ lvl: 2, miss: 1, alt: true }), { result: 'miss' }).cards[ID];
        assert.deepEqual([s.lvl, s.miss, s.alt], [1, 0, false]);
        const floor = answer(withState({ lvl: 1, miss: 1, alt: true }), { result: 'miss' }).cards[ID];
        assert.equal(floor.lvl, 1);
        const write = applyAnswer({ cards: { [ID]: { ...initial('write'), miss: 1, alt: true } }, formats: {} }, ID, 'write',
            { result: 'miss', ms: 1, format: 'tiles', typed: '', today: '2026-11-11', top: 4 }).cards[ID];
        assert.equal(write.lvl, 2);
    });
    test('applyAnswer_RightAfterAMiss_ClearsTheMissCount', () => {
        const s = answer(withState({ lvl: 2, miss: 1, alt: true }), { result: 'right' }).cards[ID];
        assert.deepEqual([s.miss, s.alt], [0, false]);
    });
    test('applyAnswer_MissAfterMastery_BackOneBelowTop', () => {
        const s = answer(withState({ lvl: 3, topDays: ['2026-11-09', '2026-11-10'] }), { result: 'miss' }).cards[ID];
        assert.deepEqual([s.lvl, s.miss], [2, 0]);
    });
    test('applyAnswer_Miss_KeepsWhatWasTyped', () => {
        assert.equal(answer(withState({ lvl: 3 }), { result: 'miss', typed: 'Tursday' }).cards[ID].last, 'Tursday');
    });
    test('applyAnswer_AnyAnswer_UpdatesPreviousFormatStats', () => {
        let l = answer(withState({ lvl: 2, fmt: 'fill' }), { result: 'right', format: 'type' });
        assert.deepEqual(l.formats.fill, { n: 1, ok: 1 });
        assert.equal(l.cards[ID].fmt, 'type');
        l = answer(l, { result: 'miss', format: 'cover' });
        assert.deepEqual(l.formats.type, { n: 1, ok: 0 });
        l = answer(l, { result: 'retry', format: 'cover' });
        assert.deepEqual(l.formats.cover, { n: 1, ok: 0 });
    });
    test('applyAnswer_RightOnLookCoverWrite_NeitherClimbsNorCountsAsKnown', () => {
        const s = answer(withState({ lvl: 3, miss: 1, alt: true }), { result: 'right', format: 'cover' }).cards[ID];
        assert.deepEqual([s.lvl, s.passed, s.topDays, s.miss, s.alt], [3, 0, [], 1, false]);
    });
    test('applyAnswer_MissOnTypeAfterARightCover_DropsALevel', () => {
        let l = answer(withState({ lvl: 3 }), { result: 'miss', format: 'type' });
        l = answer(l, { result: 'right', format: 'cover' });
        l = answer(l, { result: 'miss', format: 'type' });
        assert.equal(l.cards[ID].lvl, 2);
    });
    test('applyAnswer_Retry_KeepsWhatWasTypedFirst', () => {
        assert.equal(answer(withState({ lvl: 3 }), { result: 'retry', typed: 'thursday' }).cards[ID].last, 'thursday');
    });
    test('applyAnswer_Input_IsNotMutated', () => {
        const before = withState({ lvl: 2 });
        const copy = structuredClone(before);
        answer(before, { result: 'right' });
        assert.deepEqual(before, copy);
    });
});

describe('pickFormat', () => {
    test('pickFormat_SmallSample_TableOrder', () => {
        assert.equal(pickFormat('spell', { lvl: 2 }, { tiles: { n: 3, ok: 3 }, fill: { n: 3, ok: 0 } }), 'fill');
        assert.equal(pickFormat('write', { lvl: 2 }, {}), 'tiles');
        assert.equal(pickFormat('write', { lvl: 4 }, {}), 'hear');
    });
    test('pickFormat_EnoughSamples_PrefersBetterFormat', () => {
        assert.equal(pickFormat('spell', { lvl: 2 }, { tiles: { n: 8, ok: 7 }, fill: { n: 8, ok: 2 } }), 'tiles');
    });
    test('pickFormat_LookCoverWriteBetterStats_StillNeverFirst', () => {
        assert.equal(pickFormat('spell', { lvl: 3 }, { type: { n: 20, ok: 2 }, cover: { n: 20, ok: 19 } }), 'type');
    });
    test('pickFormat_AltFlag_OtherFormatOrPick2', () => {
        assert.equal(pickFormat('spell', { lvl: 2, alt: true }, {}), 'tiles');
        assert.equal(pickFormat('spell', { lvl: 3, alt: true }, {}), 'cover');
        assert.equal(pickFormat('spell', { lvl: 1, alt: true }, {}), 'pick2');
        assert.equal(pickFormat('write', { lvl: 4, alt: true }, {}), 'hear');
    });
});

describe('isMastered', () => {
    test('isMastered_TwoDays_True', () => {
        assert.equal(isMastered({ topDays: ['2026-11-10', '2026-11-11'] }), true);
        assert.equal(isMastered({ topDays: ['2026-11-11'] }), false);
        assert.equal(isMastered(undefined), false);
    });
});
