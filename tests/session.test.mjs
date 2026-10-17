// tests/session.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compose, GS_CONSTRAINTS } from '../assets/core/session.js';
import { recordResult } from '../assets/core/progress.js';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';

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
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const realDecks = await Promise.all(DECK_FILES.map(async n => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'))));
const realCards = expandCards(realDecks, { firstName: 'Léa' });
const itemOf = (id) => id.split('#')[0];
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// One session a day, as the page plays it, for `days` days; the child answers right with probability p.
function simulate(days, p, seed = 7) {
    const rng = lcg(seed);
    let srs = { cards: {}, introduced: {} };
    const firstDay = {};
    for (let d = 0; d < days; d++) {
        const today = addDays('2026-11-01', d);
        const { slots } = compose({ srs, cards: realCards, today, rng });
        for (const s of slots) {
            firstDay[itemOf(s.id)] ??= d;
            srs = recordResult(srs, s.id, rng() < p, today);
        }
    }
    return { srs, firstDay };
}

describe('compose', () => {
    test('compose_EmptySrs_Returns6SlotsWithinNewBudget', () => {
        const { slots, introduced } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T, rng: seq(0.1, 0.5, 0.9) });
        assert.equal(slots.length, 6);
        const newLetters = new Set(introduced.filter(id => id.startsWith('letters/')).map(id => id.split('#')[0]));
        assert.ok(newLetters.size <= 2, `letters introduced: ${[...newLetters]}`);
    });
    test('compose_Always_HasExactlyOneTraceInSlot3Or4', () => {
        // R26: trace is never a first skill, so the letters' first cards are known (box 2) to unlock it
        const srs = { cards: {}, introduced: {} };
        for (const l of 'aeiolmnt') srs.cards[`letters/${l}#letter-3scripts`] = { box: 2, due: '2026-10-19' };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards: pool(), today: T });
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
    test('compose_BrandNewItem_EntersWithItsFirstSkillOnly', () => {
        const { slots } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T, rng: seq(0.1, 0.5, 0.9) });
        const firstSkill = { letters: 'letter-3scripts', words: 'syll-count', numbers: 'count' };
        for (const s of slots) assert.equal(s.skill, firstSkill[s.kind], s.id);
    });
    test('compose_FirstCardInBox2_UnlocksSiblingsWithoutChargingTheItemBudget', () => {
        const yesterday = '2026-10-16';
        const srs = { cards: { 'letters/a#letter-3scripts': { box: 2, due: '2026-10-19' } }, introduced: { [yesterday]: ['letters/a'], [T]: ['letters/e', 'letters/i'] } };
        srs.cards['letters/e#letter-3scripts'] = { box: 1, due: '2026-10-18' };
        srs.cards['letters/i#letter-3scripts'] = { box: 1, due: '2026-10-18' };
        const cards = pool().filter(c => c.kind === 'letters');
        const seen = new Set();
        for (let k = 0; k < 50; k++) for (const s of compose({ srs, cards, today: T, rng: lcg(k) }).slots) seen.add(s.id);
        // letter budget is spent today (e, i): only a's unlocked siblings may come as new cards
        assert.ok(seen.has('letters/a#sound-letter') || seen.has('letters/a#trace'), [...seen].join());
        assert.ok(![...seen].some(id => /letters\/[olmnt]#/.test(id)), [...seen].join());
        // e and i are still in box 1: their siblings stay locked
        assert.ok(![...seen].some(id => /letters\/[ei]#(sound-letter|trace)/.test(id)), [...seen].join());
    });
    test('compose_FirstCardStillInBox1_KeepsSiblingsLocked', () => {
        const srs = { cards: { 'letters/a#letter-3scripts': { box: 1, due: '2026-10-18' } }, introduced: {} };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards: pool(), today: T, rng: lcg(k) });
            assert.ok(!slots.some(s => /letters\/a#(sound-letter|trace)/.test(s.id)), slots.map(s => s.id).join());
        }
    });
    test('compose_ItemIntroducedEarlierToday_StillOffersItsUnlockedSiblings', () => {
        const srs = { cards: { 'letters/a#letter-3scripts': { box: 2, due: '2026-10-19' } }, introduced: { [T]: ['letters/a'] } };
        const cards = pool().filter(c => c.id.startsWith('letters/a#'));
        const { slots, introduced } = compose({ srs, cards, today: T, rng: seq(0.1) });
        assert.ok(slots.some(s => s.id === 'letters/a#sound-letter'), slots.map(s => s.id).join());
        assert.deepEqual(introduced, []);
    });
    test('compose_MoreDueThanSlotsAndNewAvailable_ReservesTwoSlotsForNewCards', () => {
        const cards = pool();
        const srs = { cards: {}, introduced: {} };
        // every word card and the a/e letters are due, the other letters have never been seen
        for (const c of cards) if (c.kind === 'words' || /letters\/[ae]#/.test(c.id)) srs.cards[c.id] = { box: 2, due: T };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards, today: T, rng: lcg(k) });
            assert.equal(slots.length, 6);
            assert.ok(slots.filter(s => !srs.cards[s.id]).length >= 2, slots.map(s => s.id).join());
        }
    });
    test('compose_MoreDueThanSlots_KeepsTheLowestBoxesAmongDue', () => {
        const cards = pool();
        const srs = { cards: {}, introduced: {} };
        const low = ['letters/a#letter-3scripts', 'words/lapin#syll-count', 'numbers/1#count', 'letters/e#sound-letter'];
        for (const c of cards) if (c.kind === 'words' || /letters\/[ae]#|numbers\/1#/.test(c.id)) srs.cards[c.id] = { box: 4, due: T };
        for (const id of low) srs.cards[id] = { box: 1, due: T };
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs, cards, today: T, rng: lcg(k) });
            for (const id of low) assert.ok(slots.some(s => s.id === id), `missing ${id}: ${slots.map(s => s.id).join()}`);
        }
    });
    test('compose_AlwaysCorrectChildOver120Days_IntroducesEveryDeckItem', () => {
        const { firstDay } = simulate(120, 1);
        const items = new Set(realCards.map(c => itemOf(c.id)));
        const missing = [...items].filter(k => firstDay[k] === undefined);
        assert.deepEqual(missing, []);
    });
    test('compose_EightyPercentCorrectChildOver180Days_IntroducesAtLeast90PercentOfItems', () => {
        const { firstDay } = simulate(180, 0.8);
        const items = new Set(realCards.map(c => itemOf(c.id)));
        const reached = [...items].filter(k => firstDay[k] !== undefined).length;
        assert.ok(reached / items.size >= 0.9, `${reached}/${items.size}`);
    });
    test('compose_RealDecksOver120Days_KeepsSessionInvariants', () => {
        const rng = lcg(11);
        let srs = { cards: {}, introduced: {} };
        for (let d = 0; d < 120; d++) {
            const today = addDays('2026-11-01', d);
            const { slots } = compose({ srs, cards: realCards, today, rng });
            assert.equal(slots.length, 6, `day ${d}`);
            const idx = slots.map((s, i) => s.skill === 'trace' ? i : -1).filter(i => i >= 0);
            assert.ok(idx.length <= 1 && (!idx.length || GS_CONSTRAINTS.traceSlots.includes(idx[0])), `day ${d} trace ${idx}`);
            for (let i = 1; i < slots.length; i++) assert.notEqual(slots[i].skill, slots[i - 1].skill, `day ${d}`);
            assert.ok(slots.filter(s => s.kind === 'numbers').length <= 2, `day ${d}`);
            const newItems = {};
            for (const s of slots) if (!Object.keys(srs.cards).some(id => itemOf(id) === itemOf(s.id))) (newItems[s.kind] ??= new Set()).add(itemOf(s.id));
            for (const [kind, set] of Object.entries(newItems)) assert.ok(set.size <= GS_CONSTRAINTS.newPerDay[kind], `day ${d} ${kind} ${[...set]}`);
            for (const s of slots) srs = recordResult(srs, s.id, rng() < 0.9, today);
        }
    });
});
