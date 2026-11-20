import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EN_LADDER, LEARN_KINDS, learnKinds, startLevel, initial, pickFormat, applyAnswer } from '../assets/en/ladder.js';
import { nextStep, applyStep } from '../assets/en/lesson-session.js';

// A table that adds the 'qa' kind of other subjects (pick → cloze → sentence), as assets/lessons/index.js does.
const T = { ...EN_LADDER,
    formats: { ...EN_LADDER.formats, qa: { 1: ['pick'], 2: ['cloze'], 3: ['sentence'] } },
    top: (kind, hasVoice) => (kind === 'qa' ? 3 : EN_LADDER.top(kind, hasVoice)) };
const qaCard = { id: 'l-g/q1#answer', deckId: 'l-g', kind: 'qa', skill: 'answer', item: { id: 'q1' }, deck: { id: 'l-g', lesson: { id: 'l' } } };
const sortCard = { ...qaCard, id: 'l-s/x#sort', kind: 'sort', skill: 'sort' };
const TODAY = '2026-11-20';
const empty = () => ({ learn: { cards: {}, formats: {} }, srs: { cards: {}, introduced: {} } });
const answerQa = (learn, a) => applyAnswer(learn, qaCard.id, 'qa', { ms: 20000, format: 'pick', typed: '', today: TODAY, top: 3, ...a }, T);

describe('ladder table', () => {
    test('EN_LADDER_Defaults_MatchLegacyConstants', () => {
        assert.deepEqual(learnKinds(), LEARN_KINDS);
    });
    test('startLevel_QaKindWithTable_Returns1', () => {
        assert.equal(startLevel('qa', T), 1);
    });
    test('initial_QaKindWithTable_StartsAtLevel1', () => {
        assert.equal(initial('qa', T).lvl, 1);
    });
    test('pickFormat_QaLevel1WithTable_ReturnsPick', () => {
        assert.equal(pickFormat('qa', initial('qa', T), {}, T), 'pick');
    });
    test('pickFormat_QaLevel1PendingMiss_ReturnsPick2', () => {
        assert.equal(pickFormat('qa', { ...initial('qa', T), alt: true }, {}, T), 'pick2');
    });
    test('applyAnswer_QaRightAtLevel1_ClimbsToLevel2', () => {
        const learn = answerQa({ cards: {}, formats: {} }, { result: 'right' });
        assert.equal(learn.cards[qaCard.id].lvl, 2);
    });
    test('applyAnswer_QaRightAtLevel3_AddsTopDay', () => {
        const start = { cards: { [qaCard.id]: { ...initial('qa', T), lvl: 3 } }, formats: {} };
        const learn = answerQa(start, { result: 'right', format: 'sentence' });
        assert.deepEqual(learn.cards[qaCard.id].topDays, [TODAY]);
        assert.equal(learn.cards[qaCard.id].lvl, 3);
    });
});

describe('lesson session with a table', () => {
    test('nextStep_NewQaCardWithTable_ReturnsLevel1PickRecorded', () => {
        const { learn, srs } = empty();
        const step = nextStep({ cards: [qaCard], srs, learn, today: TODAY, index: 2, total: 10, table: T });
        assert.deepEqual({ level: step.level, format: step.format, record: step.record, isNew: step.isNew },
            { level: 1, format: 'pick', record: true, isNew: true });
    });
    test('nextStep_QaCardWithoutTable_ReturnsNonLearnStep', () => {
        const { learn, srs } = empty();
        const step = nextStep({ cards: [qaCard], srs, learn, today: TODAY, index: 2, total: 10 });
        assert.equal(step.format, null);
    });
    test('applyStep_QaRightAtTopWithTable_CreatesLeitnerState', () => {
        const { srs } = empty();
        const learn = { cards: { [qaCard.id]: { ...initial('qa', T), lvl: 3 } }, formats: {} };
        const step = { card: qaCard, level: 3, format: 'sentence', record: true, isNew: false };
        const out = applyStep({ learn, srs, step, result: 'right', ms: 30000, typed: 'x', today: TODAY, table: T });
        assert.equal(out.srs.cards[qaCard.id].box, 2);
        assert.equal(out.learning, false);
    });
    test('applyStep_SortCardRight_RecordsLeitnerOnly', () => {
        const { learn, srs } = empty();
        const step = { card: sortCard, level: null, format: null, record: true, isNew: true };
        const out = applyStep({ learn, srs, step, result: 'right', ms: 3000, typed: '', today: TODAY, table: T });
        assert.equal(out.learn, learn);
        assert.ok(out.srs.cards[sortCard.id]);
    });
});
