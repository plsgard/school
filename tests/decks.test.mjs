// tests/decks.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';
import { OBJECTS, PATTERN_NAMES } from '../assets/gs/generators.js';
import { THEMES } from '../assets/gs/themes.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = await Promise.all(DECK_FILES.map(load));
const wordDecks = decks.filter(d => d.kind === 'words');
const allWords = wordDecks.flatMap(d => d.items);
// Card ids shipped before this iteration (progress on the iPad is keyed by them), expanded from the plan's base commit.
const BEFORE = JSON.parse(await readFile(new URL('./helpers/card-ids-2026-10-17.json', import.meta.url), 'utf8'));

describe('expandCards', () => {
    test('expandCards_LetterWithSoundAndTrace_HasFiveSkills', () => {
        const a = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/l#')).map(c => c.skill).sort();
        assert.deepEqual(a, ['blend', 'letter-3scripts', 'sound-letter', 'trace', 'trace-cap']);
    });
    test('expandCards_Letters_TraceCapRightBeforeTrace', () => {
        const all = expandCards(decks, { firstName: '' });
        for (const l of decks[0].items) {
            const skills = all.filter(c => c.id.startsWith(`letters/${l.id}#`)).map(c => c.skill);
            assert.equal(skills[0], 'letter-3scripts', l.id);
            assert.equal(skills.indexOf('trace') - skills.indexOf('trace-cap'), 1, `${l.id}: ${skills}`);
        }
    });
    test('expandCards_OcclusiveLetter_HasThreeScriptsAndTrace', () => {
        const p = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/p#')).map(c => c.skill);
        assert.deepEqual(p, ['letter-3scripts', 'trace-cap', 'trace']);
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
        for (const w of allWords) {
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
        for (const w of allWords) {
            const skills = cards.filter(c => c.item.id === w.id && c.kind === 'words').map(c => c.skill);
            assert.equal(new Set(skills).size, skills.length, w.id);
            assert.ok(skills.includes('syll-count') && skills.includes('sound-pick'), w.id);
        }
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
    test('expandCards_ExistingCardIds_AllStillPresent', () => {
        const ids = new Set(expandCards(decks, { firstName: 'Lou' }).map(c => c.id));
        assert.deepEqual(BEFORE.filter(id => !ids.has(id)), []);
    });
    test('expandCards_ExistingWords_FirstSkillUnchanged', () => {
        const first = {};
        for (const c of expandCards(decks, { firstName: '' })) if (c.deckId === 'mots-p1') first[c.item.id] ??= c.skill;
        const firstBefore = {};
        for (const id of BEFORE.filter(id => id.startsWith('mots-p1/'))) { const [p, s] = id.split('#'); firstBefore[p.split('/')[1]] ??= s; }
        assert.deepEqual(first, firstBefore);
    });
    test('expandCards_SoundFinal_OnlyForWordsWithAFinal', () => {
        const cards = expandCards(decks, { firstName: '' });
        for (const d of wordDecks) for (const w of d.items) assert.equal(cards.some(c => c.id === `${d.id}/${w.id}#sound-final`), w.final !== null, w.id);
    });
    test('expandCards_SyllInitial_OnlyForWordsWithTwoSyllablesOrMore', () => {
        const cards = expandCards(decks, { firstName: '' });
        for (const d of wordDecks) for (const w of d.items) assert.equal(cards.some(c => c.id === `${d.id}/${w.id}#syll-initial`), w.syll.length >= 2, w.id);
    });
    test('expandCards_NumberGames_Ranges', () => {
        const ids = new Set(expandCards(decks, { firstName: '' }).map(c => c.id));
        const has = (n, s) => ids.has(`numbers/${n}#${s}`);
        for (let n = 0; n <= 10; n++) {
            assert.equal(has(n, 'dice'), n >= 1, `dice ${n}`);
            assert.equal(has(n, 'before-after'), n >= 1, `before-after ${n}`);
            assert.equal(has(n, 'add'), n >= 2 && n <= 5, `add ${n}`);
        }
    });
    test('wordDecks_AllWords_EmojiAndIdsUniqueAcrossDecksAndNoReservedEmoji', () => {
        assert.equal(new Set(allWords.map(w => w.id)).size, allWords.length);
        assert.equal(new Set(allWords.map(w => w.emoji)).size, allWords.length);
        // Page controls, profile avatars, counting objects, pattern shapes and theme buttons: a word never looks like one.
        const reserved = [...OBJECTS.map(o => o.emoji), ...Object.keys(PATTERN_NAMES), ...THEMES.map(t => t.emoji),
            '✔', '✔️', '🎉', '⚙️', '🏠', '🌙', '🔊', '🦊', '🐼'];
        for (const w of allWords) assert.ok(!reserved.includes(w.emoji), `${w.id} ${w.emoji}`);
    });
    test('wordDecks_AllWords_WrittenStartIsTheInitialAndIdsAscii', () => {
        const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
        for (const w of allWords) {
            assert.ok(fold(w.text).startsWith(w.initial), `${w.id}: ${w.text} / ${w.initial}`);
            assert.match(w.id, /^[a-z]+$/);
        }
    });
    test('motsGs_Deck_HasInternalSyllAndRhymePartners', () => {
        const cards = expandCards(decks, { firstName: '' });
        for (const id of ['chateau', 'chameau', 'savon', 'salade']) assert.ok(cards.some(c => c.id === `mots-gs/${id}#syll-match`), id);
        for (const id of ['robot', 'fourmi', 'mouton', 'requin', 'bebe']) assert.ok(cards.some(c => c.id === `mots-gs/${id}#rhyme`), id);
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
    const FINALS = ['a', 'é', 'i', 'o', 'u', 'l', 'm', 'n', 'r', 's', 'v', 'z', 'j', 'ch', 'f', 'p', 'b', 't', 'd', 'k', 'g'];
    test('words_Deck_FinalIsAKnownSoundOrNullOnlyForNasalEndings', () => {
        for (const w of allWords) {
            assert.ok('final' in w, w.id);
            if (w.final === null) assert.ok(['in', 'on', 'an', 'en', 'ou', 'oin'].includes(w.rhyme), w.id);
            else assert.ok(FINALS.includes(w.final), `${w.id} ${w.final}`);
        }
    });
});
