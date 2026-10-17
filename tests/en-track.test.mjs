import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DECK_FILES, expandCards } from '../assets/en/decks/index.js';
import { generate } from '../assets/en/generators.js';
import { nextCard, enSettings, streak, EN_PROFILE } from '../assets/en/rules.js';
import { recordResult } from '../assets/core/progress.js';

const decks = await Promise.all(DECK_FILES.map(async n => JSON.parse(await readFile(new URL(`../assets/en/decks/${n}.json`, import.meta.url), 'utf8'))));
const cards = expandCards(decks);
const day = '2026-10-17';
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function play(srs, n, right = () => true) {
    const played = new Set();
    const order = [];
    for (let i = 0; i < n; i++) {
        const c = nextCard({ srs, cards, played, today: day, rng: seeded(i + 1) });
        if (!c) break;
        played.add(c.id); order.push(c);
        srs = recordResult(srs, c.id, right(c), day, EN_PROFILE);
    }
    return { srs, order };
}

describe('decks', () => {
    test('decks_EveryItem_HasIdEnglishAnswersAndFrench', () => {
        for (const d of decks) {
            assert.equal(d.kind, 'vocab');
            const ids = new Set();
            for (const it of d.items) {
                assert.match(it.id, /^[a-z0-9-]+$/);
                assert.equal(ids.has(it.id), false, it.id); ids.add(it.id);
                assert.ok(Array.isArray(it.en) && it.en.length > 0 && it.en.every(s => typeof s === 'string' && s.trim()), it.id);
                assert.ok(it.fr, it.id);
            }
            const imgs = d.items.map(i => i.img).filter(Boolean);
            assert.equal(new Set(imgs).size, imgs.length, 'emoji unique in a deck');
        }
    });
});

describe('generate', () => {
    test('generate_ListenPick_FourChoicesOneCorrectNoDuplicateMeaning', () => {
        for (const c of cards.filter(c => c.skill === 'listen-pick')) {
            const ex = generate(c, { cards, rng: seeded(3) });
            assert.equal(ex.choices.length, 4);
            assert.equal(ex.choices.filter(x => x.correct).length, 1);
            assert.equal(ex.choices.find(x => x.correct).id, c.item.id);
            assert.equal(new Set(ex.choices.map(x => x.fr)).size, 4);
            assert.equal(ex.say, c.item.en[0]);
        }
    });
    test('generate_SayIt_ExpectsEveryAcceptedAnswer', () => {
        const c = cards.find(c => c.id === 'my-school-bag/school-bag#say-it');
        const ex = generate(c, { cards });
        assert.deepEqual(ex.expected, ['a school bag', 'a schoolbag', 'a backpack']);
        assert.match(ex.consigne, / !$/);
    });
});

describe('nextCard', () => {
    test('nextCard_FirstDayAllRight_IntroducesSixItemsAndTheirSayIt', () => {
        const { order } = play({ cards: {}, introduced: {} }, 12);
        assert.equal(order.length, 12);
        assert.equal(order.filter(c => c.skill === 'listen-pick').length, 6);
        assert.equal(order.filter(c => c.skill === 'say-it').length, 6);
        for (const c of order.filter(c => c.skill === 'say-it')) {
            const lp = order.findIndex(x => x.id === c.id.replace('#say-it', '#listen-pick'));
            assert.ok(lp >= 0 && lp < order.indexOf(c), 'listening before speaking');
        }
    });
    test('nextCard_FirstDayAllWrong_StopsAfterTheDailyNewItems', () => {
        const { order } = play({ cards: {}, introduced: {} }, 12, () => false);
        assert.equal(order.length, 6);
        assert.equal(order.every(c => c.skill === 'listen-pick'), true);
    });
    test('nextCard_SameSession_NeverRepeatsACard', () => {
        const { order } = play({ cards: {}, introduced: {} }, 20);
        assert.equal(new Set(order.map(c => c.id)).size, order.length);
    });
});

describe('nextCard (later days)', () => {
    const at = (box, due) => ({ box, due, seen: 1, lapses: 0 });
    test('nextCard_DueReviewsAndNotDueHighBoxes_NeverPlaysNotDueBeforeDueOrNew', () => {
        const ids = cards.filter(c => c.skill === 'listen-pick').map(c => c.id);
        const srs = { cards: {}, introduced: {} };
        for (const id of ids.slice(0, 4)) srs.cards[id] = at(3, '2026-10-30');
        for (const id of ids.slice(4, 7)) srs.cards[id] = at(1, day);
        const { order } = play(srs, 12);
        const firstPadding = order.findIndex(c => srs.cards[c.id]?.due === '2026-10-30');
        const lastOther = Math.max(...order.map((c, i) => (srs.cards[c.id]?.due === '2026-10-30' ? -1 : i)));
        assert.ok(firstPadding === -1 || firstPadding > lastOther, 'padding only after due and new cards');
    });
    test('nextCard_DueAndNew_AlternateStartingWithAReview', () => {
        const ids = cards.filter(c => c.skill === 'listen-pick').map(c => c.id);
        const srs = { cards: {}, introduced: {} };
        for (const id of ids.slice(0, 3)) srs.cards[id] = at(1, day);
        const { order } = play(srs, 4, () => false);
        assert.deepEqual(order.map(c => (srs.cards[c.id] ? 'due' : 'new')), ['due', 'new', 'due', 'new']);
    });
});

describe('enSettings', () => {
    test('enSettings_EmptyOrInvalid_FallsBackToDefaults', () => {
        assert.deepEqual(enSettings({ sessionItems: 6 }), { enItems: 12, precision: 'normal', tries: 3, mic: 'auto', enVoice: '' });
        assert.equal(enSettings({ enItems: 99, tries: 0, precision: 'x' }).enItems, 20);
        assert.equal(enSettings({ tries: 0 }).tries, 3);
        assert.equal(enSettings({ precision: 'x' }).precision, 'normal');
    });
});

describe('streak', () => {
    test('streak_ConsecutiveDaysEndingYesterday_CountsThem', () => {
        const at = (d) => ({ date: new Date(`${d}T18:00:00`).toISOString() });
        assert.equal(streak([at('2026-10-16'), at('2026-10-15'), at('2026-10-13')], day), 2);
        assert.equal(streak([at('2026-10-17'), at('2026-10-16')], day), 2);
        assert.equal(streak([at('2026-10-14')], day), 0);
    });
});
