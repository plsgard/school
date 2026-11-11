import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, strictFor, tidy } from '../assets/en/answer.js';

const BOTH = { case: true, punct: true };

describe('checkAnswer', () => {
    test('checkAnswer_Exact_Right', () => {
        assert.deepEqual(checkAnswer(['Wednesday, April 12th'], 'Wednesday, April 12th', BOTH), { outcome: 'right', reasons: [] });
    });
    test('checkAnswer_TrailingAndDoubleSpacesCurlyApostrophe_Right', () => {
        assert.equal(checkAnswer(["It's Monday"], '  It’s   Monday ', BOTH).outcome, 'right');
    });
    test('checkAnswer_LowercaseDayStrictCase_AlmostCase', () => {
        assert.deepEqual(checkAnswer(['Wednesday'], 'wednesday', BOTH), { outcome: 'almost', reasons: ['case'] });
    });
    test('checkAnswer_LowercaseDayCaseNotStrict_Right', () => {
        assert.equal(checkAnswer(['the first'], 'The First', { case: false, punct: false }).outcome, 'right');
    });
    test('checkAnswer_MissingCommaStrictPunct_AlmostPunct', () => {
        assert.deepEqual(checkAnswer(['Wednesday, April 12th'], 'Wednesday April 12th', BOTH), { outcome: 'almost', reasons: ['punct'] });
    });
    test('checkAnswer_MissingCommaPunctNotStrict_Right', () => {
        assert.equal(checkAnswer(['Wednesday, April 12th'], 'Wednesday April 12th', { case: true, punct: false }).outcome, 'right');
    });
    test('checkAnswer_BothMissing_AlmostCaseAndPunct', () => {
        assert.deepEqual(checkAnswer(['Wednesday, April 12th'], 'wednesday april 12th', BOTH), { outcome: 'almost', reasons: ['case', 'punct'] });
    });
    test('checkAnswer_OneLetterOff_AlmostSpelling', () => {
        assert.deepEqual(checkAnswer(['Thursday'], 'Tursday', BOTH), { outcome: 'almost', reasons: ['spelling'] });
    });
    test('checkAnswer_ShortAnswerOneOff_AlmostSpelling', () => {
        assert.deepEqual(checkAnswer(['3rd'], '3nd', BOTH), { outcome: 'almost', reasons: ['spelling'] });
    });
    test('checkAnswer_ShortAnswerTwoOff_Wrong', () => {
        assert.equal(checkAnswer(['May'], 'Mai5', BOTH).outcome, 'wrong');
    });
    test('checkAnswer_FarOff_Wrong', () => {
        assert.deepEqual(checkAnswer(['Thursday'], 'Monday', BOTH), { outcome: 'wrong', reasons: [] });
    });
    test('checkAnswer_CloseButAnotherItemsAnswer_Wrong', () => {
        // "Tuesday" is two letters from "Thursday": it is not a typo, it is the wrong day.
        assert.equal(checkAnswer(['Thursday'], 'tuesday', BOTH, ['Tuesday', 'Monday']).outcome, 'wrong');
        assert.equal(checkAnswer(['Thursday'], 'Tursday', BOTH, ['Tuesday', 'Monday']).outcome, 'almost');
    });
    test('checkAnswer_Empty_Wrong', () => {
        assert.equal(checkAnswer(['May'], '   ', BOTH).outcome, 'wrong');
    });
    test('checkAnswer_SecondAcceptedAnswer_Right', () => {
        assert.equal(checkAnswer(['Today is Monday.', 'Today is Monday'], 'Today is Monday', BOTH).outcome, 'right');
    });
});

describe('strictFor', () => {
    test('strictFor_Defaults_PerKind', () => {
        assert.deepEqual(strictFor('write', {}), { case: true, punct: true });
        assert.deepEqual(strictFor('spell', {}), { case: true, punct: false });
    });
    test('strictFor_ItemOverride_Wins', () => {
        assert.deepEqual(strictFor('spell', { strict: { case: false } }), { case: false, punct: false });
    });
});

describe('tidy', () => {
    test('tidy_SpacesAndApostrophe_Normalised', () => {
        assert.equal(tidy(' a  b’c '), "a b'c");
    });
});
