import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, phoneticKey, scoreSpeech, wordMatches } from '../assets/en/pronounce.js';

describe('normalise', () => {
    test('normalise_ContractionsPunctuationAndDigits_ExpandsToPlainWords', () => {
        assert.deepEqual(normalise("What's your name? I'm 11… no, 12!"), ['what', 'is', 'your', 'name', 'i', 'am', 'eleven', 'no', 'twelve']);
    });
    test('normalise_UsSpelling_MapsToBritish', () => {
        assert.deepEqual(normalise('My favorite color is gray'), ['my', 'favourite', 'colour', 'is', 'grey']);
    });
    test('normalise_CurlyApostrophe_TreatedLikeStraight', () => {
        assert.deepEqual(normalise('don’t'), ['do', 'not']);
    });
});

describe('phoneticKey', () => {
    test('phoneticKey_SameSoundDifferentSpelling_SameKey', () => {
        assert.equal(phoneticKey('sea'), phoneticKey('see'));
        assert.equal(phoneticKey('right'), phoneticKey('write'));
    });
    test('phoneticKey_ThVersusS_DifferentWhenStrictSameWhenLenient', () => {
        assert.notEqual(phoneticKey('think'), phoneticKey('sink'));
        assert.equal(phoneticKey('think', true), phoneticKey('sink', true));
    });
    test('phoneticKey_DroppedH_SameWhenLenient', () => {
        assert.equal(phoneticKey('happy', true), phoneticKey('appy', true));
    });
});

describe('wordMatches', () => {
    test('wordMatches_ExactLevel_OnlyIdenticalWords', () => {
        assert.equal(wordMatches('ruler', 'ruler', 'exact'), true);
        assert.equal(wordMatches('ruler', 'rule', 'exact'), false);
    });
    test('wordMatches_PhoneticLevel_AcceptsPluralSlipNotThAsT', () => {
        assert.equal(wordMatches('scissors', 'scissor', 'phonetic'), true);
        assert.equal(wordMatches('three', 'tree', 'phonetic'), false);
    });
    test('wordMatches_LenientLevel_AcceptsFrenchAccentSwaps', () => {
        assert.equal(wordMatches('three', 'tree', 'lenient'), true);
        assert.equal(wordMatches('think', 'sink', 'lenient'), true);
    });
    test('wordMatches_LenientLevel_RejectsUnrelatedWords', () => {
        assert.equal(wordMatches('ruler', 'pencil', 'lenient'), false);
        assert.equal(wordMatches('book', 'pen', 'lenient'), false);
        assert.equal(wordMatches('book', 'bag', 'lenient'), false);
    });
    test('wordMatches_PhoneticLevel_RejectsAnotherVowel', () => {
        for (const [e, h] of [['pen', 'pan'], ['pen', 'pin'], ['book', 'bike'], ['book', 'back'], ['diary', 'dairy']]) {
            assert.equal(wordMatches(e, h, 'phonetic'), false, `${e}/${h}`);
        }
    });
    test('wordMatches_ExactLevel_AcceptsRecogniserPluralSlip', () => {
        assert.equal(wordMatches('highlighter', 'highlighters', 'exact'), true);
    });
});

describe('scoreSpeech', () => {
    test('scoreSpeech_WordWithoutArticle_AcceptedAtEveryLevel', () => {
        for (const level of ['indulgent', 'normal', 'exigeant']) assert.equal(scoreSpeech(['a ruler'], ['ruler'], level).ok, true, level);
    });
    test('scoreSpeech_AnyAcceptedAnswerAndAnyAlternative_BestPairWins', () => {
        const r = scoreSpeech(['a school bag', 'a backpack'], ['a back pack', 'backpack'], 'exigeant');
        assert.equal(r.ok, true);
        assert.equal(r.heard, 'backpack');
    });
    test('scoreSpeech_AccentedSentence_PassesIndulgentNotExigeant', () => {
        const expected = ['I think the three cats are happy.'];
        const heard = ['I sink the tree cats are appy'];
        assert.equal(scoreSpeech(expected, heard, 'indulgent').ok, true);
        assert.equal(scoreSpeech(expected, heard, 'exigeant').ok, false);
    });
    test('scoreSpeech_HalfTheSentence_FailsNormalAndMarksHeardWords', () => {
        const r = scoreSpeech(['I need a pencil sharpener'], ['I need'], 'normal');
        assert.equal(r.ok, false);
        assert.deepEqual(r.words.map(w => w.heard), [true, true, false, false, false]);
    });
    test('scoreSpeech_ExtraFillerWords_Ignored', () => {
        assert.equal(scoreSpeech(['a glue stick'], ['um a glue stick please'], 'exigeant').ok, true);
    });
    test('scoreSpeech_NothingHeard_NotOkAndNothingMarked', () => {
        const r = scoreSpeech(['a pen'], [], 'indulgent');
        assert.equal(r.ok, false);
        assert.equal(r.words.every(w => !w.heard), true);
    });
    test('scoreSpeech_SentenceMode_WrongFormRejectedAtEveryLevel', () => {
        const cases = [
            [["She's got a cat.", 'She has got a cat.', 'She has a cat.'], 'she have got a cat'],
            [["She's got a cat.", 'She has got a cat.', 'She has a cat.'], 'she is got a cat'],
            [["He hasn't got a bike.", "He doesn't have a bike."], "he don't have a bike"],
            [["We haven't got a garden.", "We don't have a garden."], 'we have got a garden'],
            [['Does he have a dog?', 'Has he got a dog?'], 'does he has a dog'],
        ];
        for (const [e, h] of cases) for (const level of ['indulgent', 'normal', 'exigeant']) {
            assert.equal(scoreSpeech(e, [h], level, { sentence: true }).ok, false, `${level}: ${h}`);
        }
    });
    test('scoreSpeech_SentenceMode_RightFormAcceptedContractedOrFull', () => {
        const e = ["She's got a cat.", 'She has got a cat.', 'She has a cat.'];
        for (const h of ["she's got a cat", 'she has got a cat', 'she has a cat']) assert.equal(scoreSpeech(e, [h], 'exigeant', { sentence: true }).ok, true, h);
        assert.equal(scoreSpeech(["We haven't got a garden."], ['we have not got a garden'], 'exigeant', { sentence: true }).ok, true);
    });
    test('scoreSpeech_JackOLanternSpellings_AllAccepted', () => {
        for (const h of ["look at the Jack O'Lantern", 'look at the jackolanterns', 'look at the jack-o-lanterns']) {
            assert.equal(scoreSpeech(["Look at the jack-o'-lanterns!"], [h], 'normal').ok, true, h);
        }
    });
    test('scoreSpeech_ContractionInAnswer_MarksWholeAnswer', () => {
        const r = scoreSpeech(["What's your name?"], ['what is your name'], 'exigeant');
        assert.equal(r.ok, true);
        assert.equal(r.words.every(w => w.heard), true);
    });
});
