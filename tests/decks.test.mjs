// tests/decks.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards } from '../assets/gs/decks/index.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];

describe('expandCards', () => {
    test('expandCards_LetterWithSoundAndTrace_HasFourSkills', () => {
        const a = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/l#')).map(c => c.skill).sort();
        assert.deepEqual(a, ['blend', 'letter-3scripts', 'sound-letter', 'trace']);
    });
    test('expandCards_OcclusiveLetter_HasThreeScriptsAndTrace', () => {
        const p = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/p#')).map(c => c.skill);
        assert.deepEqual(p, ['letter-3scripts', 'trace']);
    });
    test('expandCards_Digits0To9_HaveATraceCardAnd10DoesNot', () => {
        const cards = expandCards(decks, { firstName: '' });
        for (let n = 0; n <= 9; n++) assert.ok(cards.some(c => c.id === `numbers/${n}#trace` && c.kind === 'numbers'), String(n));
        assert.ok(!cards.some(c => c.id === 'numbers/10#trace'));
    });
    test('expandCards_NumberZero_HasOnlyATraceCard', () => {
        assert.deepEqual(expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('numbers/0#')).map(c => c.skill), ['trace']);
    });
    test('numbers_Deck_ZeroIsIntroducedLast', () => {
        assert.equal(decks[1].items.at(-1).id, '0');
    });
    test('expandCards_FirstNameGiven_AddsNameSpellCard', () => {
        const cards = expandCards(decks, { firstName: 'Lou' });
        assert.ok(cards.some(c => c.id === 'name/lou#name-spell'));
    });
    test('expandCards_Words_WrittenSyllablesSpellTheWord', () => {
        for (const w of decks[2].items) {
            const written = w.syllW ?? w.syll;
            assert.equal(written.length, w.syll.length, w.id);
            assert.equal(written.join(''), w.text, w.id);
        }
    });
    test('expandCards_Words_FirstSkillVariesByItemAndLettersStartWith3Scripts', () => {
        const cards = expandCards(decks, { firstName: '' });
        const first = (kind) => { const m = new Map(); for (const c of cards) if (c.kind === kind && !m.has(c.item.id)) m.set(c.item.id, c.skill); return [...m.values()]; };
        const words = first('words');
        for (const sk of ['syll-count', 'sound-pick']) assert.ok(words.filter(x => x === sk).length >= 3, `${sk}: ${words}`);
        assert.ok(first('letters').every(sk => sk === 'letter-3scripts'));
        for (const w of decks[2].items) {
            const skills = cards.filter(c => c.item.id === w.id && c.kind === 'words').map(c => c.skill);
            assert.equal(new Set(skills).size, skills.length, w.id);
            assert.ok(skills.includes('syll-count') && skills.includes('sound-pick'), w.id);
        }
    });
    test('expandCards_Words_EmojiNeverClashesWithAControl', () => {
        for (const w of decks[2].items) assert.ok(!['🏠', '🌙', '⭐', '🔊'].includes(w.emoji), `${w.id} ${w.emoji}`);
    });
    test('expandCards_Always_IdsAreUnique', () => {
        const ids = expandCards(decks, { firstName: 'Lou' }).map(c => c.id);
        assert.equal(new Set(ids).size, ids.length);
    });
    test('expandCards_WordWithoutRhymePartner_HasNoRhymeCard', () => {
        const fusee = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('mots-p1/fusee#')).map(c => c.skill);
        assert.ok(!fusee.includes('rhyme'));
        assert.ok(fusee.includes('syll-count') && fusee.includes('sound-pick'));
    });
    test('expandCards_WordWithRhymePartner_HasRhymeCard', () => {
        const cards = expandCards(decks, { firstName: '' });
        assert.ok(cards.some(c => c.id === 'mots-p1/lapin#rhyme'));
        assert.ok(cards.some(c => c.id === 'mots-p1/sapin#rhyme'));
    });
    test('expandCards_WordWithSyllablePartner_HasSyllMatch', () => {
        const cards = expandCards(decks, { firstName: '' });
        assert.ok(cards.some(c => c.id === 'mots-p1/lapin#syll-match'));
        assert.ok(cards.some(c => c.id === 'mots-p1/lama#syll-match'));
        assert.ok(!cards.some(c => c.id === 'mots-p1/sapin#syll-match'));
    });
    test('expandCards_FirstNameWithNonLetters_IdKeepsOnlyLetters', () => {
        const cards = expandCards(decks, { firstName: ' Marie-Lou ' });
        assert.ok(cards.some(c => c.id === 'name/marielou#name-spell'));
    });
    test('letters_Deck_Has26ItemsWithConfusables', () => {
        const letters = decks[0].items;
        assert.equal(letters.length, 26);
        for (const l of letters) assert.ok(l.confusables.length >= 2, l.id);
    });
    test('letters_Deck_VowelsThenContinuantsThenOcclusives', () => {
        const rank = (l) => ('aeiou'.includes(l.id) ? 0 : l.continuant ? 1 : 2);
        const ranks = decks[0].items.map(rank);
        assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b));
    });
    test('letters_Deck_OnlyOneLetterPerSound', () => {
        const sounds = decks[0].items.map(l => l.sound).filter(Boolean);
        assert.equal(new Set(sounds).size, sounds.length);
    });
    test('words_Deck_EmojiAndIdsAreUnique', () => {
        const words = decks[2].items;
        assert.equal(new Set(words.map(w => w.emoji)).size, words.length);
        assert.equal(new Set(words.map(w => w.id)).size, words.length);
    });
    const FINALS = ['a', 'é', 'i', 'o', 'u', 'l', 'm', 'n', 'r', 's', 'v', 'z', 'j', 'ch', 'f', 'p', 'b', 't', 'd', 'k', 'g'];
    test('words_Deck_FinalIsAKnownSoundOrNullOnlyForNasalEndings', () => {
        for (const w of decks[2].items) {
            assert.ok('final' in w, w.id);
            if (w.final === null) assert.ok(['in', 'on', 'an', 'en', 'ou', 'oin'].includes(w.rhyme), w.id);
            else assert.ok(FINALS.includes(w.final), `${w.id} ${w.final}`);
        }
    });
});
