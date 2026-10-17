// tests/session.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compose, GS_CONSTRAINTS } from '../assets/core/session.js';

const T = '2026-10-17';
const card = (id, kind, skill) => ({ id, deckId: kind, kind, skill, item: { id } });
function pool() {
    const c = [];
    for (const l of 'aeiolmnt') for (const sk of ['letter-3scripts', 'sound-letter', 'trace']) c.push(card(`letters/${l}#${sk}`, 'letters', sk));
    for (const w of ['lapin', 'chapeau', 'fusee', 'moto', 'sapin']) for (const sk of ['syll-count', 'syll-match', 'sound-pick']) c.push(card(`words/${w}#${sk}`, 'words', sk));
    for (let n = 0; n <= 10; n++) for (const sk of ['count', 'compare', 'decompose']) c.push(card(`numbers/${n}#${sk}`, 'numbers', sk));
    return c;
}
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('compose', () => {
    test('compose_EmptySrs_Returns6SlotsWithinNewBudget', () => {
        const { slots, introduced } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T, rng: seq(0.1, 0.5, 0.9) });
        assert.equal(slots.length, 6);
        const newLetters = new Set(introduced.filter(id => id.startsWith('letters/')).map(id => id.split('#')[0]));
        assert.ok(newLetters.size <= 2, `letters introduced: ${[...newLetters]}`);
    });
    test('compose_Always_HasExactlyOneTraceInSlot3Or4', () => {
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T });
            const idx = slots.map((s, i) => s.skill === 'trace' ? i : -1).filter(i => i >= 0);
            assert.deepEqual(idx.length, 1);
            assert.ok(GS_CONSTRAINTS.traceSlots.includes(idx[0]));
        }
    });
    test('compose_Always_NoSameTypeTwiceInARowAndMax2Numbers', () => {
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T });
            for (let i = 1; i < slots.length; i++) assert.notEqual(slots[i].skill, slots[i - 1].skill);
            assert.ok(slots.filter(s => s.kind === 'numbers').length <= 2);
        }
    });
    test('compose_DueCardsFirst_PrefersLowBoxes', () => {
        const srs = { cards: { 'words/lapin#syll-match': { box: 1, due: T }, 'letters/a#trace': { box: 1, due: T } }, introduced: {} };
        const { slots } = compose({ srs, cards: pool(), today: T });
        assert.ok(slots.some(s => s.id === 'words/lapin#syll-match'));
        assert.ok(slots.some(s => s.id === 'letters/a#trace'));
    });
    test('compose_NothingDueAndNoNewLeft_PadsFromHighBoxes', () => {
        const cards = pool();
        const srs = { cards: {}, introduced: { [T]: [] } };
        for (const c of cards) srs.cards[c.id] = { box: 5, due: '2026-12-01', seen: 9, lapses: 0 };
        const { slots } = compose({ srs, cards, today: T });
        assert.equal(slots.length, 6);
    });
    test('compose_IntroducedToday_CountsAgainstBudget', () => {
        const srs = { cards: {}, introduced: { [T]: ['letters/a', 'letters/e'] } };
        const { introduced } = compose({ srs, cards: pool(), today: T });
        assert.ok(!introduced.some(id => id.startsWith('letters/')));
    });
});
