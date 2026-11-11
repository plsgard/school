import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { almostMessage, markDiff } from '../assets/en/lesson-play.js';

describe('almostMessage', () => {
    test('almostMessage_EachReason_NamesIt', () => {
        assert.match(almostMessage(['case']), /majuscules\.$/);
        assert.match(almostMessage(['punct']), /ponctuation/);
        assert.match(almostMessage(['case', 'punct']), /majuscules et à la ponctuation/);
        assert.match(almostMessage(['spelling']), /orthographe/);
        assert.match(almostMessage(['case']), /^Presque !/);
    });
});

describe('markDiff', () => {
    test('markDiff_MissingLetter_MarksOnlyTheMiddle', () => {
        assert.deepEqual(markDiff('Thursday', 'Tursday'), ['T', 'h', 'ursday']);
    });
    test('markDiff_WrongSuffix_MarksTheEnd', () => {
        assert.deepEqual(markDiff('3rd', '3nd'), ['3', 'r', 'd']);
    });
    test('markDiff_NothingTypedOrAllDifferent_MarksEverything', () => {
        assert.deepEqual(markDiff('May', ''), ['', 'May', '']);
        assert.deepEqual(markDiff('May', 'xyz'), ['', 'May', '']);
    });
    test('markDiff_Same_MarksNothing', () => {
        assert.deepEqual(markDiff('May', 'May'), ['May', '', '']);
    });
});
