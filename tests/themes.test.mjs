// tests/themes.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';
import { THEMES, themeOf, inTheme } from '../assets/gs/themes.js';

const decks = await Promise.all(DECK_FILES.map(async n => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'))));
const cards = expandCards(decks, { firstName: 'Lou' });
const NEW_SKILLS = ['sound-final', 'syll-initial', 'dice', 'before-after', 'add'];

describe('themeOf', () => {
    test('themeOf_EveryShippedCard_HasExactlyOneTheme', () => {
        for (const c of cards) assert.ok(themeOf(c), c.id);
        const all = THEMES.flatMap(t => t.skills);
        assert.equal(new Set(all).size, all.length, 'a skill in two themes');
    });
    test('themeOf_SkillsAddedByThisIteration_AreMapped', () => {
        for (const skill of NEW_SKILLS) assert.ok(themeOf({ skill }), skill);
    });
    test('themeOf_DigitTrace_IsEcrireNotNombres', () => {
        assert.equal(themeOf({ kind: 'numbers', skill: 'trace' }), 'ecrire');
    });
    test('themeOf_BlendAndSoundLetter_SonsAndLettres', () => {
        assert.equal(themeOf({ skill: 'blend' }), 'sons');
        assert.equal(themeOf({ skill: 'sound-letter' }), 'lettres');
    });
});

describe('inTheme', () => {
    test('inTheme_ShippedDecks_EveryThemeHasAtLeastTenCards', () => {
        for (const t of THEMES) assert.ok(cards.filter(inTheme(t.id)).length >= 10, t.id);
    });
});

describe('THEMES', () => {
    test('THEMES_Always_FourButtonsWithAsciiIdsEmojiAndLabels', () => {
        assert.deepEqual(THEMES.map(t => t.id), ['sons', 'lettres', 'ecrire', 'nombres']);
        for (const t of THEMES) { assert.match(t.id, /^[a-z]+$/); assert.ok(t.emoji && t.label); }
    });
});
