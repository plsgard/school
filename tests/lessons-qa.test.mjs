import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fold, checkSentence, clozeOf, checkCloze, generateQa } from '../assets/lessons/qa.js';

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const card = (item) => ({ id: `demo-questions/${item.id}#answer`, deckId: 'demo-questions', kind: 'qa', skill: 'answer', item });
const item = {
    id: 'q1', q: 'Que font les bactéries ?', a: 'Les bactéries transforment le lait en yaourt.',
    keys: [['bactéries', 'ferments'], ['lait']],
    wrong: ['Le lait cuit tout seul.', 'Le sucre transforme le lait.', 'Le yaourt pousse.'],
};

describe('fold', () => {
    test('fold_AccentsCasePunctuationAndLigature_AreRemoved', () => {
        assert.equal(fold('  L’Œuf, c’est   À la Crème ! '), 'l oeuf c est a la creme');
    });
});

describe('checkSentence', () => {
    test('checkSentence_AllKeysPresentWithoutAccents_ReturnsRight', () => {
        assert.deepEqual(checkSentence([['bactéries', 'ferments'], ['lait']], 'des bacteries transforment le LAIT'), { outcome: 'right', missing: 0 });
    });
    test('checkSentence_OneKeyMissing_ReturnsAlmostWithMissing1', () => {
        assert.deepEqual(checkSentence([['bactéries'], ['lait']], 'les bactéries travaillent'), { outcome: 'almost', missing: 1 });
    });
    test('checkSentence_NoKeyPresent_ReturnsWrong', () => {
        assert.equal(checkSentence([['bactéries'], ['lait']], 'je ne sais pas').outcome, 'wrong');
    });
    test('checkSentence_Empty_ReturnsWrong', () => {
        assert.equal(checkSentence([['lait']], '   ').outcome, 'wrong');
    });
    test('checkSentence_OneLetterOffOnLongWord_ReturnsRight', () => {
        assert.equal(checkSentence([['bactéries']], 'une bactérie').outcome, 'right');
    });
    test('checkSentence_ShortWordOneLetterOff_ReturnsWrong', () => {
        assert.equal(checkSentence([['lait']], 'le laid').outcome, 'wrong');
    });
    test('checkSentence_KeyInsideAnotherWord_IsNotPresent', () => {
        assert.equal(checkSentence([['lait']], 'une laitue').outcome, 'wrong');
    });
    test('checkSentence_MultiWordAlternative_MatchesConsecutiveWords', () => {
        assert.equal(checkSentence([['canne à sucre']], 'de la canne a sucre').outcome, 'right');
        assert.equal(checkSentence([['canne à sucre']], 'la canne et le sucre').outcome, 'wrong');
    });
});

describe('cloze', () => {
    test('clozeOf_NoClozeField_UsesFirstKeyFoundInAnswer', () => {
        assert.deepEqual(clozeOf(item), { before: 'Les ', after: ' transforment le lait en yaourt.', answer: 'bactéries' });
    });
    test('clozeOf_ClozeField_SplitsAroundIt', () => {
        assert.deepEqual(clozeOf({ ...item, cloze: 'yaourt' }), { before: 'Les bactéries transforment le lait en ', after: '.', answer: 'yaourt' });
    });
    test('clozeOf_KeyAbsentFromAnswer_ReturnsNull', () => {
        assert.equal(clozeOf({ ...item, keys: [['soleil']] }), null);
    });
    test('checkCloze_AccentMissing_ReturnsRight', () => {
        assert.equal(checkCloze('bactéries', 'bacteries'), 'right');
    });
    test('checkCloze_OneLetterOff_ReturnsAlmost', () => {
        assert.equal(checkCloze('bactéries', 'bactries'), 'almost');
    });
    test('checkCloze_OtherWord_ReturnsWrong', () => {
        assert.equal(checkCloze('bactéries', 'levure'), 'wrong');
    });
});

describe('generateQa', () => {
    test('generateQa_Pick_HasTheAnswerAndThreeWrongChoices', () => {
        const ex = generateQa(card(item), { format: 'pick', rng: seeded() });
        assert.equal(ex.type, 'pick');
        assert.equal(ex.choices.length, 4);
        assert.deepEqual(ex.choices.filter(c => c.correct).map(c => c.text), [item.a]);
        assert.equal(ex.cue, item.q);
        assert.equal(ex.model, item.a);
    });
    test('generateQa_PickWithOneWrongChoice_ReturnsTwoChoicesWithoutThrowing', () => {
        const ex = generateQa(card({ ...item, wrong: ['Le yaourt pousse.'] }), { format: 'pick', rng: seeded() });
        assert.equal(ex.choices.length, 2);
    });
    test('generateQa_Pick2_HasTheAnswerAndTheFirstWrong', () => {
        const ex = generateQa(card(item), { format: 'pick2', rng: seeded() });
        assert.deepEqual(ex.choices.map(c => c.text).sort(), [item.a, item.wrong[0]].sort());
    });
    test('generateQa_Cloze_CarriesTheCloze', () => {
        const ex = generateQa(card(item), { format: 'cloze', rng: seeded() });
        assert.equal(ex.type, 'cloze');
        assert.equal(ex.cloze.answer, 'bactéries');
    });
    test('generateQa_ClozeWithoutKeyInAnswer_FallsBackToSentence', () => {
        const ex = generateQa(card({ ...item, keys: [['soleil']] }), { format: 'cloze', rng: seeded() });
        assert.equal(ex.type, 'sentence');
        assert.deepEqual(ex.keys, [['soleil']]);
    });
    test('generateQa_Sentence_CarriesTheKeys', () => {
        const ex = generateQa(card(item), { format: 'sentence' });
        assert.deepEqual({ type: ex.type, keys: ex.keys, kind: ex.kind }, { type: 'sentence', keys: item.keys, kind: 'qa' });
    });
});
