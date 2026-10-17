// tests/rules.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';
import { generate } from '../assets/gs/generators.js';
import { localDay, dailyCapReached, extraSessionState, effectiveParentMode, cardLabel, adultHint, practiceItems } from '../assets/gs/rules.js';

const decks = await Promise.all(DECK_FILES.map(async n => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'))));
const cards = expandCards(decks, { firstName: 'Lou' });
const day = '2026-10-17';
const at = (h) => new Date(2026, 9, 17, h).toISOString(); // local time on `day`
const yesterday = new Date(2026, 9, 16, 18).toISOString();

describe('localDay', () => {
    test('localDay_LocalDate_ReturnsLocalIsoDay', () => {
        assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
    });
});

describe('dailyCapReached', () => {
    test('dailyCapReached_NoSessionToday_ReturnsFalse', () => {
        assert.equal(dailyCapReached([{ date: yesterday }], {}, day), false);
    });
    test('dailyCapReached_OneSessionTodayNoExtra_ReturnsTrue', () => {
        assert.equal(dailyCapReached([{ date: at(9) }], {}, day), true);
    });
    test('dailyCapReached_OneSessionTodayWithExtraToday_ReturnsFalse', () => {
        assert.equal(dailyCapReached([{ date: at(9) }], { extraSessionOn: day }, day), false);
    });
    test('dailyCapReached_TwoSessionsTodayWithExtraToday_ReturnsTrue', () => {
        assert.equal(dailyCapReached([{ date: at(10) }, { date: at(9) }], { extraSessionOn: day }, day), true);
    });
    test('dailyCapReached_ExtraGrantedYesterday_DoesNotCountToday', () => {
        assert.equal(dailyCapReached([{ date: at(9) }], { extraSessionOn: '2026-10-16' }, day), true);
    });
});

describe('extraSessionState', () => {
    test('extraSessionState_NotPlayedToday_ReturnsNotPlayed', () => {
        assert.equal(extraSessionState([], {}, day), 'not-played');
    });
    test('extraSessionState_PlayedOnceNoExtra_ReturnsCanGrant', () => {
        assert.equal(extraSessionState([{ date: at(9) }], {}, day), 'can-grant');
    });
    test('extraSessionState_ExtraGrantedNotYetPlayed_ReturnsGranted', () => {
        assert.equal(extraSessionState([{ date: at(9) }], { extraSessionOn: day }, day), 'granted');
    });
    test('extraSessionState_ExtraGrantedAndPlayed_ReturnsUsed', () => {
        assert.equal(extraSessionState([{ date: at(10) }, { date: at(9) }], { extraSessionOn: day }, day), 'used');
    });
});

describe('effectiveParentMode', () => {
    test('effectiveParentMode_NeverSetNoFrenchVoiceNoClips_ReturnsTrue', () => {
        assert.equal(effectiveParentMode({ parentMode: null, audio: 'clips' }, { hasFrenchVoice: false, hasClips: false }), true);
    });
    test('effectiveParentMode_NeverSetNoFrenchVoiceButClipsPlay_ReturnsFalse', () => {
        assert.equal(effectiveParentMode({ parentMode: null, audio: 'clips' }, { hasFrenchVoice: false, hasClips: true }), false);
    });
    test('effectiveParentMode_NeverSetDeviceSourceNoFrenchVoice_ReturnsTrueEvenWithClips', () => {
        assert.equal(effectiveParentMode({ parentMode: null, audio: 'device' }, { hasFrenchVoice: false, hasClips: true }), true);
    });
    test('effectiveParentMode_NeverSetWithFrenchVoice_ReturnsFalse', () => {
        assert.equal(effectiveParentMode({ parentMode: null, audio: 'device' }, { hasFrenchVoice: true, hasClips: false }), false);
    });
    test('effectiveParentMode_ExplicitlyOff_StaysOffWithoutVoice', () => {
        assert.equal(effectiveParentMode({ parentMode: false, audio: 'device' }, { hasFrenchVoice: false, hasClips: false }), false);
    });
    test('effectiveParentMode_ExplicitlyOn_StaysOn', () => {
        assert.equal(effectiveParentMode({ parentMode: true, audio: 'clips' }, { hasFrenchVoice: true, hasClips: true }), true);
    });
});

describe('cardLabel', () => {
    test('cardLabel_WordCard_ShowsWordAndSkill', () => {
        assert.equal(cardLabel('mots-p1/lapin#rhyme', cards), 'lapin · rime');
    });
    test('cardLabel_LetterCard_ShowsLetterAndSkill', () => {
        assert.equal(cardLabel('letters/a#trace', cards), 'lettre a · tracer');
    });
    test('cardLabel_NumberCard_ShowsNumberAndSkill', () => {
        assert.equal(cardLabel('numbers/7#count', cards), 'nombre 7 · compter');
    });
    test('cardLabel_NameCard_ShowsFirstName', () => {
        assert.equal(cardLabel('name/lou#name-spell', cards), 'prénom Lou · épeler');
    });
    test('cardLabel_UnknownCard_FallsBackToItsId', () => {
        assert.equal(cardLabel('old/gone#rhyme', cards), 'gone · rime');
    });
    test('cardLabel_EverySkill_HasAFrenchLabel', () => {
        for (const c of cards) assert.doesNotMatch(cardLabel(c.id, cards), /#|-/, c.id);
    });
    test('cardLabel_NewSkills_HaveFrenchLabels', () => {
        // The decks emit these skills only from Task 9: build the cards here so the test is green from Task 3 on.
        const num = (n, skill) => ({ id: `numbers/${n}#${skill}`, kind: 'numbers', skill, item: { id: String(n), n } });
        const word = (id, skill) => ({ id: `mots-p1/${id}#${skill}`, kind: 'words', skill, item: { id, text: id } });
        const extra = [word('chat', 'sound-final'), word('lapin', 'syll-initial'), num(7, 'dice'), num(7, 'before-after'), num(4, 'add'), num(7, 'trace')];
        const all = [...cards, ...extra];
        assert.equal(cardLabel('mots-p1/chat#sound-final', all), 'chat · dernier son');
        assert.equal(cardLabel('mots-p1/lapin#syll-initial', all), 'lapin · première syllabe');
        assert.equal(cardLabel('numbers/7#dice', all), 'nombre 7 · dé');
        assert.equal(cardLabel('numbers/7#before-after', all), 'nombre 7 · avant / après');
        assert.equal(cardLabel('numbers/4#add', all), 'nombre 4 · additionner');
        assert.equal(cardLabel('numbers/7#trace', all), 'nombre 7 · tracer');
    });
});

describe('adultHint', () => {
    test('adultHint_Blend_SpellsTheStretchedSoundsAndSyllable', () => {
        const ex = generate(cards.find(c => c.id === 'letters/f#blend'), { cards, rng: () => 0 });
        assert.equal(adultHint(ex), 'Faites-lui étirer le premier son, puis coller les deux sons\u00a0: fff… aaa… fa.');
    });
    test('adultHint_Trace_ShowsTheGreenDotHint', () => {
        const ex = generate(cards.find(c => c.id === 'letters/a#trace'), { cards });
        assert.match(adultHint(ex), /point vert/);
    });
    test('adultHint_OtherExercise_ReturnsNull', () => {
        assert.equal(adultHint(generate(cards.find(c => c.id === 'numbers/7#count'), { cards })), null);
    });
    test('adultHint_DigitTrace_SaysChiffre', () => {
        assert.equal(adultHint({ type: 'trace', trace: { kind: 'digit' } }), 'Montrez le point vert, puis tracez le chiffre une fois dans l\'air, ensemble.');
    });
    test('adultHint_TwoStrokeTrace_MentionsTheBlueDot', () => {
        assert.match(adultHint({ type: 'trace', trace: { kind: 'digit', pts2: [[0, 0]] } }), /deuxième trait, au point bleu\.$/);
    });
});

describe('practiceItems', () => {
    test('practiceItems_Missing_Defaults6', () => assert.equal(practiceItems({}), 6));
    test('practiceItems_OutOfRange_Clamps', () => {
        assert.equal(practiceItems({ practiceItems: 3 }), 6);
        assert.equal(practiceItems({ practiceItems: 14 }), 10);
        assert.equal(practiceItems({ practiceItems: '8' }), 8);
    });
});
