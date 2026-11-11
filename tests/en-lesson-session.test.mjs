import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LESSON_FILES, flattenLesson, expandCards } from '../assets/en/decks/index.js';
import { nextStep, afterAnswer, applyStep, examSoon, available, inLearning } from '../assets/en/lesson-session.js';
import { initial } from '../assets/en/ladder.js';

const lesson = JSON.parse(await readFile(new URL(`../assets/en/decks/${LESSON_FILES[0]}.json`, import.meta.url), 'utf8'));
const cards = expandCards(flattenLesson(lesson));
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 18, 0);
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const id = (group, item) => `what-day-is-it-${group}/${item}#write`;
const empty = () => ({ learn: { cards: {}, formats: {} }, srs: { cards: {}, introduced: {} } });
const known = (kind, days = [TODAY]) => ({ ...initial(kind), lvl: kind === 'write' ? 4 : 3, passed: kind === 'write' ? 4 : 3, topDays: days });

// Plays a whole session; answer(step, i) → 'right' | 'retry' | 'miss' (ms decides fast/slow).
function play({ learn, srs }, { total = 12, exam = '2026-11-13', today = TODAY, answer = () => 'right', ms = 60000, hasVoice = true, only = cards } = {}) {
    let owed = [], newCount = 0;
    const history = [], steps = [];
    for (let index = 0; index < total; index++) {
        const step = nextStep({ cards: only, srs, learn, today, exam, hasVoice, history, owed, index, total, newCount, rng: seeded(index + 1), now: NOW });
        if (!step) break;
        if (step.isNew) newCount++;
        const result = answer(step, index);
        const out = applyStep({ learn, srs, step, result, ms, typed: result === 'miss' ? 'oops' : '', today, hasVoice });
        ({ learn, srs } = out);
        history.push({ cardId: step.card.id, recorded: step.record });
        if (step.record) owed = afterAnswer({ owed, cardId: step.card.id, index, learning: out.learning });
        steps.push({ ...step, result });
    }
    return { learn, srs, steps };
}

describe('examSoon', () => {
    test('examSoon_TodayOrWithinAWeek_True', () => {
        assert.equal(examSoon('2026-11-13', TODAY), true);
        assert.equal(examSoon(TODAY, TODAY), true);
        assert.equal(examSoon('2026-11-18', TODAY), true);
    });
    test('examSoon_PastFarOrMissing_False', () => {
        assert.equal(examSoon('2026-11-10', TODAY), false);
        assert.equal(examSoon('2026-11-19', TODAY), false);
        assert.equal(examSoon(null, TODAY), false);
    });
});

describe('available', () => {
    test('available_DateWhoseWordsAreNotMet_Locked', () => {
        const date = cards.find(c => c.id === id('dates', 'mon-sep-7'));
        assert.equal(available(date, { cards, learn: { cards: {}, formats: {} }, now: NOW }), false);
        const learn = { cards: { [id('days', 'monday')]: initial('spell'), [id('months', 'september')]: initial('spell') }, formats: {} };
        assert.equal(available(date, { cards, learn, now: NOW }), true);
    });
    test('available_DateWithASuffixItem_AlsoWaitsForTheSuffix', () => {
        const date = cards.find(c => c.id === id('dates', 'wed-apr-12'));
        const learn = { cards: { [id('days', 'wednesday')]: initial('spell'), [id('months', 'april')]: initial('spell') }, formats: {} };
        assert.equal(available(date, { cards, learn, now: NOW }), false);
        learn.cards[id('suffix', 'n12')] = initial('spell');
        assert.equal(available(date, { cards, learn, now: NOW }), true);
    });
});

describe('nextStep', () => {
    test('nextStep_NoHistory_OpensWithFirstGroupLevelOnePick', () => {
        const steps = play(empty(), { total: 6 }).steps.slice(0, 4);
        assert.deepEqual(steps.map(s => s.card.item.id), ['monday', 'tuesday', 'wednesday', 'thursday']);
        assert.ok(steps.every(s => s.level === 1 && s.format === 'pick' && s.record && s.isNew));
    });
    test('nextStep_FirstSession_ClosesOnAnUnrecordedReplayOfASuccess', () => {
        const last = play(empty(), { total: 4 }).steps.at(-1);
        assert.deepEqual([last.card.item.id, last.level, last.record], ['monday', 1, false]);
    });
    test('nextStep_OwedCard_ComesBackAfterThreeOthersOneLevelUp', () => {
        const { steps } = play(empty(), { total: 6 });
        assert.equal(steps[4].card.item.id, 'monday');
        assert.equal(steps[4].level, 2);
        assert.equal(steps[5].card.item.id, 'tuesday');
    });
    test('nextStep_FastRightAnswers_KnownAfterTwoPlays', () => {
        const { learn, srs, steps } = play(empty(), { total: 8, ms: 1000, only: cards.filter(c => c.kind === 'spell') });
        assert.deepEqual(steps.slice(4).map(s => s.level), [3, 3, 3, 3]);
        assert.deepEqual(learn.cards[id('days', 'monday')].topDays, [TODAY]);
        assert.equal(srs.cards[id('days', 'monday')].box, 2);
    });
    test('nextStep_AnySession_NeverSameCardTwiceInARow', () => {
        for (const answer of [() => 'right', () => 'miss', (s, i) => (i % 2 ? 'miss' : 'right')]) {
            const { steps } = play(empty(), { total: 20, answer });
            for (let i = 1; i < steps.length; i++) assert.notEqual(steps[i].card.id, steps[i - 1].card.id, `slot ${i}`);
        }
    });
    test('nextStep_CardPlayedThreeTimes_NotRecordedAFourthTime', () => {
        const { steps } = play(empty(), { total: 20, answer: () => 'miss', only: cards.slice(0, 7) });
        const counts = new Map();
        for (const s of steps.filter(s => s.record)) counts.set(s.card.id, (counts.get(s.card.id) ?? 0) + 1);
        assert.ok([...counts.values()].every(n => n <= 3), JSON.stringify([...counts]));
    });
    test('nextStep_FirstMiss_ComesBackInTheOtherFormatThenDropsALevel', () => {
        const state = empty();
        state.learn.cards[id('days', 'monday')] = { ...initial('spell'), lvl: 2 };
        const only = cards.filter(c => c.deckId === 'what-day-is-it-days');
        const { steps } = play(state, { total: 12, only, answer: (s) => (s.card.item.id === 'monday' ? 'miss' : 'right') });
        const monday = steps.filter(s => s.card.item.id === 'monday' && s.record);
        assert.deepEqual(monday.map(s => [s.level, s.format]), [[2, 'fill'], [2, 'tiles'], [1, 'pick']]);
    });
    test('nextStep_WithPassedCards_FirstTwoAndLastAreUnrecordedReplays', () => {
        const state = empty();
        for (const d of ['monday', 'tuesday', 'wednesday']) state.learn.cards[id('days', d)] = { ...initial('spell'), lvl: 2, passed: 1 };
        const { steps, learn } = play(state, { total: 8 });
        assert.deepEqual(steps.map(s => s.record), [false, false, true, true, true, true, true, false]);
        assert.ok([0, 1].every(i => steps[i].level === 1 && steps[i].format === 'pick'));
        assert.notEqual(steps[0].card.id, steps[1].card.id);
        assert.equal(learn.cards[steps[0].card.id].passed >= 1, true);
    });
    test('nextStep_UnrecordedReplay_ChangesNothing', () => {
        const state = empty();
        state.learn.cards[id('days', 'monday')] = { ...initial('spell'), lvl: 2, passed: 1 };
        const step = nextStep({ cards, ...state, today: TODAY, index: 0, total: 8, now: NOW });
        assert.equal(step.record, false);
        const out = applyStep({ ...state, step, result: 'miss', ms: 1, typed: 'x', today: TODAY });
        assert.deepEqual(out.learn, state.learn);
        assert.deepEqual(out.srs, state.srs);
    });
    test('nextStep_ThirdSlots_PreferAPhraseOnceItsWordsAreMet', () => {
        const state = empty();
        for (const c of cards.filter(c => c.kind === 'spell').slice(0, 19)) state.learn.cards[c.id] = { ...initial('spell') };
        const { steps } = play(state, { total: 12 });
        assert.equal(steps[2].card.kind, 'spell', 'the opening slots stay with the words');
        assert.deepEqual([steps[5].card.kind, steps[5].level, steps[5].format, steps[5].isNew], ['write', 2, 'tiles', true]);
        assert.equal(steps[8].card.kind, 'write');
    });
    test('nextStep_NoPhraseAvailable_ThirdSlotTakesTheNextCard', () => {
        const { steps } = play(empty(), { total: 6, only: cards.filter(c => c.kind === 'spell') });
        assert.equal(steps[5].card.kind, 'spell');
    });
    test('nextStep_NoExam_NewCappedAtHalfTheSession', () => {
        const { steps } = play(empty(), { total: 12, exam: null, answer: () => 'right', ms: 1000 });
        assert.equal(steps.filter(s => s.isNew).length, 6);
    });
    test('nextStep_ExamSoon_NoCapOnNewItems', () => {
        const args = { cards, ...empty(), today: TODAY, index: 3, total: 12, newCount: 99, now: NOW };
        assert.equal(nextStep({ ...args, exam: '2026-11-13' }).isNew, true);
        assert.equal(nextStep({ ...args, exam: null }), null);
    });
    test('nextStep_ExamSoonKnownYesterday_ComesBackTodayAtTopLevel', () => {
        const state = empty();
        const card = id('days', 'monday');
        state.learn.cards[card] = known('spell', ['2026-11-10']);
        state.srs.cards[card] = { box: 2, due: '2026-11-12', seen: 1, lapses: 0 };
        const only = cards.filter(c => c.id === card || c.id === id('days', 'tuesday'));
        state.learn.cards[id('days', 'tuesday')] = known('spell', ['2026-11-09', '2026-11-10']);
        state.srs.cards[id('days', 'tuesday')] = { box: 3, due: '2026-11-14', seen: 2, lapses: 0 };
        const recorded = play(state, { total: 6, only }).steps.filter(s => s.record);
        assert.deepEqual(recorded.map(s => [s.card.item.id, s.level]), [['monday', 3]]);
        const far = play(state, { total: 6, only, exam: '2026-12-25' }).steps.filter(s => s.record);
        assert.deepEqual(far, []);
    });
    test('nextStep_AllMastered_OnlyUnrecordedReplaysNeverThrows', () => {
        const state = empty();
        const only = cards.filter(c => c.deckId === 'what-day-is-it-days');
        for (const c of only) {
            state.learn.cards[c.id] = known('spell', ['2026-11-09', '2026-11-10']);
            state.srs.cards[c.id] = { box: 3, due: '2026-11-20', seen: 2, lapses: 0 };
        }
        const { steps, learn } = play(state, { total: 12, only });
        assert.ok(steps.length > 0 && steps.every(s => !s.record));
        assert.deepEqual(learn, state.learn);
    });
    test('nextStep_SingleCardLesson_EndsEarlyInsteadOfRepeating', () => {
        const { steps } = play(empty(), { total: 12, only: cards.slice(0, 1) });
        assert.ok(steps.length < 12);
        for (let i = 1; i < steps.length; i++) assert.notEqual(steps[i].card.id, steps[i - 1].card.id);
    });
    test('nextStep_UnknownStoredIds_Ignored', () => {
        const state = empty();
        state.learn.cards['gone/item#write'] = { ...initial('spell'), lvl: 2, passed: 1 };
        state.srs.cards['gone/item#write'] = { box: 1, due: TODAY, seen: 1, lapses: 1 };
        const { steps } = play(state, { total: 6 });
        assert.equal(steps.length, 6);
        assert.ok(steps.every(s => s.card.id !== 'gone/item#write'));
    });
    test('nextStep_GrammarCards_NewAfterTheWrittenGroupsThenDueReviews', () => {
        const only = cards.filter(c => c.kind === 'grammar');
        const first = play(empty(), { total: 3, only });
        assert.deepEqual(first.steps.map(s => [s.card.skill, s.level, s.format, s.isNew]), Array(3).fill(['gap-pick', null, null, true]));
        assert.equal(first.srs.cards[only[0].id].box, 2);
        const later = play({ learn: first.learn, srs: first.srs }, { total: 2, only: only.slice(0, 3), today: '2026-11-13' });
        assert.deepEqual(later.steps.map(s => s.isNew), [false, false]);
    });
    test('nextStep_WithoutVoice_PhrasesStopAtTyping', () => {
        const state = empty();
        for (const c of cards.filter(c => c.kind === 'spell')) state.learn.cards[c.id] = known('spell', ['2026-11-09', '2026-11-10']);
        const only = cards.filter(c => c.kind !== 'grammar');
        const { steps } = play(state, { total: 20, only, hasVoice: false, ms: 60000 });
        const phrases = steps.filter(s => s.card.kind === 'write' && s.record);
        assert.ok(phrases.length > 0);
        assert.ok(phrases.every(s => s.level <= 3 && s.format !== 'hear'));
    });
});

describe('applyStep', () => {
    const step = (level, format = 'type') => ({ card: cards.find(c => c.id === id('days', 'monday')), level, format, record: true, isNew: false });
    test('applyStep_RightBelowTop_NoLeitnerStateYet', () => {
        const out = applyStep({ ...empty(), step: step(1, 'pick'), result: 'right', ms: 60000, typed: '', today: TODAY });
        assert.equal(out.srs.cards[id('days', 'monday')], undefined);
        assert.equal(out.learning, true);
    });
    test('applyStep_FirstRightAtTop_EntersLeitnerAndStopsBeingOwed', () => {
        const s = empty();
        s.learn.cards[id('days', 'monday')] = { ...initial('spell'), lvl: 3 };
        const out = applyStep({ ...s, step: step(3), result: 'right', ms: 60000, typed: '', today: TODAY });
        assert.deepEqual(out.srs.cards[id('days', 'monday')], { box: 2, due: '2026-11-13', seen: 1, lapses: 0 });
        assert.equal(out.learning, false);
    });
    test('applyStep_RightAtTopNotDue_BoxUnchangedButDayCounted', () => {
        const s = empty();
        s.learn.cards[id('days', 'monday')] = known('spell', ['2026-11-10']);
        s.srs.cards[id('days', 'monday')] = { box: 2, due: '2026-11-12', seen: 1, lapses: 0 };
        const out = applyStep({ ...s, step: step(3), result: 'right', ms: 60000, typed: '', today: TODAY });
        assert.equal(out.srs.cards[id('days', 'monday')].box, 2);
        assert.deepEqual(out.learn.cards[id('days', 'monday')].topDays, ['2026-11-10', TODAY]);
    });
    test('applyStep_MissOnAKnownCard_DemotesTheBoxAndReturnsToLearning', () => {
        const s = empty();
        s.learn.cards[id('days', 'monday')] = known('spell', ['2026-11-09', '2026-11-10']);
        s.srs.cards[id('days', 'monday')] = { box: 3, due: TODAY, seen: 2, lapses: 0 };
        const out = applyStep({ ...s, step: step(3), result: 'miss', ms: 1, typed: 'Munday', today: TODAY });
        assert.deepEqual([out.srs.cards[id('days', 'monday')].box, out.srs.cards[id('days', 'monday')].lapses], [1, 1]);
        assert.equal(out.learn.cards[id('days', 'monday')].lvl, 2);
        assert.equal(out.learn.cards[id('days', 'monday')].last, 'Munday');
        assert.equal(out.learning, true);
    });
    test('applyStep_Retry_LeavesTheBoxAlone', () => {
        const s = empty();
        s.learn.cards[id('days', 'monday')] = known('spell', ['2026-11-10']);
        s.srs.cards[id('days', 'monday')] = { box: 2, due: TODAY, seen: 1, lapses: 0 };
        const out = applyStep({ ...s, step: step(3), result: 'retry', ms: 1, typed: '', today: TODAY });
        assert.deepEqual(out.srs, s.srs);
    });
});

describe('inLearning', () => {
    test('inLearning_KnownButSentBackBelowTop_True', () => {
        assert.equal(inLearning({ lvl: 2, topDays: [TODAY] }, 'spell', 3), true);
        assert.equal(inLearning({ lvl: 3, topDays: [TODAY] }, 'spell', 3), false);
        assert.equal(inLearning({ lvl: 3, topDays: [] }, 'spell', 3), true);
    });
});
