// tests/scheduler.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { record, dueCards, addDays, boxCounts, GS_PROFILE } from '../assets/core/scheduler.js';

const T = '2026-10-17';

describe('addDays', () => {
    test('addDays_AcrossMonthEnd_Rolls', () => assert.equal(addDays('2026-10-30', 2), '2026-11-01'));
});

describe('record', () => {
    test('record_NewCardCorrect_GoesToBox2DueIn2Days', () => {
        const srs = record({ cards: {}, introduced: {} }, 'a#trace', true, T);
        assert.deepEqual(srs.cards['a#trace'], { box: 2, due: '2026-10-19', seen: 1, lapses: 0 });
    });
    test('record_NewCardWrong_StaysBox1DueTomorrow', () => {
        const srs = record({ cards: {}, introduced: {} }, 'a#trace', false, T);
        assert.deepEqual(srs.cards['a#trace'], { box: 1, due: '2026-10-18', seen: 1, lapses: 1 });
    });
    test('record_Box5Correct_StaysBox5Weekly', () => {
        const srs = record({ cards: { x: { box: 5, due: T, seen: 9, lapses: 0 } }, introduced: {} }, 'x', true, T);
        assert.equal(srs.cards.x.box, 5);
        assert.equal(srs.cards.x.due, '2026-10-24');
    });
    test('record_Box4Wrong_DropsToBox2', () => {
        const srs = record({ cards: { x: { box: 4, due: T, seen: 3, lapses: 0 } }, introduced: {} }, 'x', false, T);
        assert.equal(srs.cards.x.box, 2);
        assert.equal(srs.cards.x.lapses, 1);
    });
    test('record_DoesNotMutateInput', () => {
        const input = { cards: {}, introduced: {} };
        record(input, 'x', true, T);
        assert.deepEqual(input, { cards: {}, introduced: {} });
    });
});

describe('dueCards', () => {
    test('dueCards_SortsByBoxThenDue', () => {
        const srs = { cards: {
            a: { box: 3, due: '2026-10-10' }, b: { box: 1, due: '2026-10-17' },
            c: { box: 1, due: '2026-10-15' }, d: { box: 2, due: '2026-10-20' } }, introduced: {} };
        assert.deepEqual(dueCards(srs, T), ['c', 'b', 'a']);
    });
});

describe('boxCounts', () => {
    test('boxCounts_CountsPerBox', () => {
        const srs = { cards: { a: { box: 1 }, b: { box: 1 }, c: { box: 5 } }, introduced: {} };
        assert.deepEqual(boxCounts(srs), [2, 0, 0, 0, 1]);
    });
});
