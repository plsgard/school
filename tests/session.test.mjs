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
    test('compose_MoreThan6DueAcrossBoxes_SelectsBox1BeforeBox3', () => {
        const srs = { cards: {}, introduced: { [T]: [] } };
        const box1 = ['letters/a#letter-3scripts', 'words/lapin#syll-count', 'numbers/1#count', 'words/moto#sound-pick', 'letters/e#trace'];
        const box3 = ['letters/i#sound-letter', 'words/fusee#syll-match', 'numbers/2#compare', 'numbers/3#decompose'];
        for (const id of box3) srs.cards[id] = { box: 3, due: T };
        for (const id of box1) srs.cards[id] = { box: 1, due: T };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards: pool(), today: T });
            for (const id of box1) assert.ok(slots.some(s => s.id === id), `missing box-1 ${id}`);
            assert.equal(slots.filter(s => srs.cards[s.id]?.box === 3).length, 1);
        }
    });
    test('compose_MixedBoxPadding_PadsOnlyFromBox4OrMoreWhenEnough', () => {
        const cards = pool();
        const srs = { cards: {}, introduced: { [T]: [] } };
        const boxFor = { letters: 5, words: 4, numbers: 1 };
        cards.forEach((c, i) => { srs.cards[c.id] = { box: c.kind === 'numbers' ? 1 + (i % 3) : boxFor[c.kind], due: '2026-12-01' }; });
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards, today: T });
            assert.equal(slots.length, 6);
            for (const s of slots) assert.ok(srs.cards[s.id].box >= 4, `${s.id} box ${srs.cards[s.id].box}`);
        }
    });
    test('compose_ThinPool_KeepsInvariantsAndNeverCompacts', () => {
        const cards = [];
        for (const l of 'aeiom') for (const sk of ['sound-letter', 'trace']) cards.push(card(`letters/${l}#${sk}`, 'letters', sk));
        const srs = { cards: {}, introduced: { [T]: [] } };
        for (const c of cards) srs.cards[c.id] = { box: 5, due: '2026-12-01' };
        for (let k = 0; k < 200; k++) {
            const { slots } = compose({ srs, cards, today: T });
            assert.ok(slots.length <= 6);
            for (let i = 1; i < slots.length; i++) assert.notEqual(slots[i].skill, slots[i - 1].skill);
            const idx = slots.map((s, i) => s.skill === 'trace' ? i : -1).filter(i => i >= 0);
            assert.ok(idx.length <= 1);
            if (idx.length) assert.ok(GS_CONSTRAINTS.traceSlots.includes(idx[0]), `trace at ${idx[0]}`);
        }
    });
    test('compose_EasyCardAvailable_PlacesBox3OrMoreInSlot0Or1', () => {
        const srs = { cards: {}, introduced: { [T]: [] } };
        for (const l of 'aeiolmnt') for (const sk of ['letter-3scripts', 'sound-letter', 'trace']) srs.cards[`letters/${l}#${sk}`] = { box: 1, due: T };
        srs.cards['words/lapin#syll-count'] = { box: 3, due: T };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards: pool(), today: T });
            assert.ok(slots.slice(0, 2).some(s => srs.cards[s.id]?.box >= 3));
        }
    });
    test('compose_NumbersTrace_CountsTowardMaxNumbers', () => {
        const cards = [];
        for (let n = 0; n <= 5; n++) for (const sk of ['count', 'compare', 'trace']) cards.push(card(`numbers/${n}#${sk}`, 'numbers', sk));
        for (const w of ['lapin', 'moto']) for (const sk of ['syll-count', 'sound-pick']) cards.push(card(`words/${w}#${sk}`, 'words', sk));
        const srs = { cards: {}, introduced: { [T]: [] } };
        for (const c of cards) srs.cards[c.id] = { box: c.kind === 'numbers' ? 1 : 2, due: T };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards, today: T });
            assert.ok(slots.filter(s => s.kind === 'numbers').length <= 2);
        }
    });
});
