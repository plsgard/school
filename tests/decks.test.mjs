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
    test('expandCards_OcclusiveWithoutTrace_HasOnlyThreeScripts', () => {
        const p = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/p#')).map(c => c.skill);
        assert.deepEqual(p, ['letter-3scripts']);
    });
    test('expandCards_Numbers_ZeroHasNoDecomposeOrLine', () => {
        const z = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('numbers/0#')).map(c => c.skill).sort();
        assert.deepEqual(z, ['compare', 'count']);
    });
    test('expandCards_FirstNameGiven_AddsNameSpellCard', () => {
        const cards = expandCards(decks, { firstName: 'Lou' });
        assert.ok(cards.some(c => c.id === 'name/lou#name-spell'));
    });
    test('expandCards_Always_IdsAreUnique', () => {
        const ids = expandCards(decks, { firstName: 'Lou' }).map(c => c.id);
        assert.equal(new Set(ids).size, ids.length);
    });
    test('expandCards_WordWithoutRhymePartner_HasNoRhymeCard', () => {
        const chat = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('mots-p1/chat#')).map(c => c.skill);
        assert.ok(!chat.includes('rhyme'));
        assert.ok(chat.includes('syll-count') && chat.includes('sound-pick'));
    });
    test('expandCards_WordWithRhymePartner_HasRhymeCard', () => {
        const cards = expandCards(decks, { firstName: '' });
        assert.ok(cards.some(c => c.id === 'mots-p1/lapin#rhyme'));
        assert.ok(cards.some(c => c.id === 'mots-p1/sapin#rhyme'));
    });
    test('expandCards_WordWithSyllablePartner_HasSyllMatch', () => {
        const cards = expandCards(decks, { firstName: '' });
        assert.ok(cards.some(c => c.id === 'mots-p1/lapin#syll-match'));
        assert.ok(cards.some(c => c.id === 'mots-p1/lavabo#syll-match'));
        assert.ok(!cards.some(c => c.id === 'mots-p1/sapin#syll-match'));
    });
    test('letters_Deck_Has26ItemsWithConfusables', () => {
        const letters = decks[0].items;
        assert.equal(letters.length, 26);
        for (const l of letters) assert.ok(l.confusables.length >= 2, l.id);
    });
});
