// tests/progress.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';
import { compose, GS_CONSTRAINTS } from '../assets/core/session.js';
import { recordResult } from '../assets/core/progress.js';

const decks = await Promise.all(DECK_FILES.map(async n => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'))));
const cards = expandCards(decks, { firstName: '' });
const day = '2026-10-17';
const fresh = () => ({ cards: {}, introduced: {} });

// One session as the page runs it: compose, then record only the items actually played.
function playSession(srs, played) {
    const { slots } = compose({ srs, cards, today: day, constraints: GS_CONSTRAINTS, rng: () => 0.3 });
    for (const c of slots.slice(0, played)) srs = recordResult(srs, c.id, true, day);
    return { srs, slots };
}

describe('recordResult', () => {
    test('recordResult_NewCard_AddsItsItemToIntroducedToday', () => {
        const srs = recordResult(fresh(), 'letters/a#trace', true, day);
        assert.deepEqual(srs.introduced[day], ['letters/a']);
        assert.equal(srs.cards['letters/a#trace'].box, 2);
    });
    test('recordResult_SecondCardOfSameItem_DoesNotDuplicateTheItem', () => {
        let srs = recordResult(fresh(), 'letters/a#trace', true, day);
        srs = recordResult(srs, 'letters/a#letter-3scripts', false, day);
        assert.deepEqual(srs.introduced[day], ['letters/a']);
    });
    test('recordResult_KnownCard_DoesNotTouchIntroduced', () => {
        const srs = { cards: { 'letters/a#trace': { box: 2, due: day, seen: 1, lapses: 0 } }, introduced: { '2026-10-16': ['letters/a'] } };
        const next = recordResult(srs, 'letters/a#trace', true, day);
        assert.equal(next.introduced[day], undefined);
        assert.equal(next.cards['letters/a#trace'].box, 3);
    });
    test('recordResult_AnyInput_DoesNotMutateIt', () => {
        const srs = fresh();
        recordResult(srs, 'letters/a#trace', true, day);
        assert.deepEqual(srs, fresh());
    });
    test('recordResult_SessionAbandonedAfterOneAnswer_OnlyThatItemIsIntroducedAndNextSessionIsFull', () => {
        const first = playSession(fresh(), 1);   // Jouer, one answer, then 🏠
        const item = first.slots[0].id.split('#')[0];
        assert.deepEqual(first.srs.introduced[day], [item]);
        assert.equal(Object.keys(first.srs.cards).length, 1);
        const { slots } = compose({ srs: first.srs, cards, today: day, constraints: GS_CONSTRAINTS, rng: () => 0.3 });
        assert.equal(slots.length, 6);
    });
});
