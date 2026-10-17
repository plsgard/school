// tests/generators.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards } from '../assets/gs/decks/index.js';
import { generate } from '../assets/gs/generators.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];
const cards = expandCards(decks, { firstName: 'Lou' });
const find = (id) => cards.find(c => c.id === id);
const rng = () => 0.42;

function assertChoiceSet(ex, n) {
    assert.equal(ex.choices.length, n);
    assert.equal(ex.choices.filter(c => c.correct).length, 1, 'exactly one correct');
    assert.equal(new Set(ex.choices.map(c => c.label)).size, n, 'distinct labels');
    if (ex.choices[0].emoji) assert.equal(new Set(ex.choices.map(c => c.emoji)).size, n, 'distinct emoji');
}

describe('generate', () => {
    test('generate_SyllMatch_CorrectSharesInitialSyllable', () => {
        const ex = generate(find('mots-p1/lapin#syll-match'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.equal(ex.choices.find(c => c.correct).label, 'lavabo');
        assert.ok(!ex.choices.some(c => c.label === 'lapin'));
    });
    test('generate_SyllCount_TargetIsSyllableCount', () => {
        const ex = generate(find('mots-p1/banane#syll-count'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.equal(ex.choices.find(c => c.correct).id, '3');
    });
    test('generate_SoundPick_DistractorsNeverShareInitial', () => {
        const ex = generate(find('mots-p1/fusee#sound-pick'), { cards, rng });
        assertChoiceSet(ex, 3);
        for (const c of ex.choices.filter(c => !c.correct)) assert.notEqual(c.id, 'fusee');
    });
    test('generate_SoundLetter_UsesOnlyContinuantsAndIncludesConfusable', () => {
        const ex = generate(find('letters/f#sound-letter'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.ok(ex.choices.some(c => c.label === 'v' || c.label === 't'));
    });
    test('generate_Letter3Scripts_HasThreeTargetsAndConfusables', () => {
        const ex = generate(find('letters/a#letter-3scripts'), { cards, rng });
        assert.equal(ex.layout, 'multitap');
        assert.equal(ex.choices.length, 6);
        assert.equal(ex.choices.filter(c => c.correct).length, 3);
    });
    test('generate_Count_CollectionSizeMatchesAndSixDigits', () => {
        const ex = generate(find('numbers/7#count'), { cards, rng });
        assert.equal(ex.stage.collection.length, 7);
        assertChoiceSet(ex, 6);
        assert.equal(ex.choices.find(c => c.correct).label, '7');
    });
    test('generate_Decompose_LitPlusMissingEqualsTarget', () => {
        const ex = generate(find('numbers/5#decompose'), { cards, rng });
        assert.equal(ex.layout, 'dots');
        assert.equal(ex.target, 5);
        assert.ok(ex.lit >= 1 && ex.lit < 5);
    });
    test('generate_Compare_BiggerIsCorrect', () => {
        const ex = generate(find('numbers/8#compare'), { cards, rng });
        assertChoiceSet(ex, 2);
        const ok = ex.choices.find(c => c.correct), ko = ex.choices.find(c => !c.correct);
        assert.ok(Number(ok.id) > Number(ko.id));
    });
    test('generate_NameSpell_AnswerIsUppercaseName', () => {
        const ex = generate(find('name/lou#name-spell'), { cards, rng });
        assert.equal(ex.layout, 'slots');
        assert.equal(ex.answer, 'LOU');
        assert.equal(ex.choices.length, 3);
    });
    test('generate_Trace_CarriesWaypoints', () => {
        const ex = generate(find('letters/a#trace'), { cards, rng });
        assert.equal(ex.layout, 'trace');
        assert.ok(ex.trace.pts.length > 5);
    });
    test('generate_Blend_CorrectIsConsonantPlusVowel', () => {
        const ex = generate(find('letters/f#blend'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.match(ex.choices.find(c => c.correct).label, /^f[aeiou]$/);
    });
    test('generate_EveryCard_ProducesAnExerciseWithPromptAndSuccess', () => {
        for (const card of cards) {
            const ex = generate(card, { cards, rng });
            assert.ok(ex.prompt.text.length > 0, card.id);
            assert.ok(ex.success.text.length > 0, card.id);
        }
    });
    test('generate_SyllMatchAndRhyme_CorrectReallySharesSyllableOrRhyme', () => {
        for (const r of [0.05, 0.42, 0.97]) {
            for (const card of cards.filter(c => c.skill === 'syll-match' || c.skill === 'rhyme')) {
                const ex = generate(card, { cards, rng: () => r });
                const ok = ex.choices.find(c => c.correct);
                const w = cards.find(c => c.kind === 'words' && c.item.id === ok.id).item;
                if (card.skill === 'syll-match') assert.equal(w.syll[0], card.item.syll[0], `${card.id} @${r}`);
                else assert.equal(w.rhyme, card.item.rhyme, `${card.id} @${r}`);
                assert.notEqual(ok.id, card.item.id, `${card.id} @${r}`);
            }
        }
    });
    test('generate_ChoicesWithEmoji_EmojiAreDistinct', () => {
        for (const r of [0.05, 0.42, 0.97]) {
            for (const card of cards) {
                const ex = generate(card, { cards, rng: () => r });
                const withEmoji = (ex.choices ?? []).filter(c => c.emoji);
                if (!withEmoji.length) continue;
                assert.equal(withEmoji.length, ex.choices.length, `${card.id} @${r}`);
                assert.equal(new Set(withEmoji.map(c => c.emoji)).size, withEmoji.length, `${card.id} @${r}`);
            }
        }
    });
    test('generate_PromptAndSuccessKeys_MapToOneTextAcrossRng', () => {
        const seen = new Map();
        for (const r of [0.05, 0.3, 0.42, 0.6, 0.97]) {
            for (const card of cards) {
                const ex = generate(card, { cards, rng: () => r });
                for (const c of [ex.prompt, ex.success]) {
                    if (seen.has(c.key)) assert.equal(c.text, seen.get(c.key), `${c.key} @${r}`);
                    seen.set(c.key, c.text);
                }
            }
        }
    });
});
