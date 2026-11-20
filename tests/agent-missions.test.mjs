import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LESSON_FILES, DECK_FILES, flattenLesson, expandCards } from '../assets/en/decks/index.js';
import { nextStep, afterAnswer, applyStep } from '../assets/en/lesson-session.js';
import { LESSON_LADDER, flattenSubjectLesson } from '../assets/lessons/index.js';
import {
    LOCKS, buildCatalog, missionTypes, pickType, createMission, canRecord, openLock, exerciseFor, answerLock, stars, missed, progressOf, needCount,
} from '../assets/agent/missions.js';

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const lessonFiles = await Promise.all(LESSON_FILES.map(n => read(`../assets/en/decks/${n}.json`)));
const deckFiles = await Promise.all(DECK_FILES.map(n => read(`../assets/en/decks/${n}.json`)));
const enDecks = [...lessonFiles.flatMap(flattenLesson), ...deckFiles];
const fixture = await read('./helpers/lesson-fixture.json');
const catalog = buildCatalog({ enDecks, subjects: { demo: flattenSubjectLesson(fixture) } });
const byId = (id) => catalog.find(l => l.id === id);
const TODAY = '2026-11-20';
const NOW = new Date(2026, 10, 20, 18, 0);
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const empty = () => ({ srs: { cards: {}, introduced: {} }, learn: { cards: {}, formats: {} } });

// Plays a mission to its end; answer(step, i) → result. Returns the mission and the final states.
function playMission(lesson, { type = 'infiltration', hasVoice = true, answer = () => 'right', training = false, state = empty() } = {}) {
    let mission = createMission({ lesson, type, hasVoice, training });
    let { srs, learn } = state;
    const steps = [];
    for (let i = 0; i < LOCKS + 2 && !mission.done; i++) {
        mission = openLock(mission, { srs, learn, today: TODAY, rng: seeded(i + 1), now: NOW });
        if (mission.done) break;
        steps.push(mission.step);
        const out = answerLock(mission, { srs, learn, result: answer(mission.step, i), ms: 60000, typed: 'oops', today: TODAY });
        ({ mission, srs, learn } = out);
    }
    return { mission, srs, learn, steps };
}

describe('buildCatalog', () => {
    test('buildCatalog_EnglishDecks_GroupsLessonGroupsAndKeepsDecksApart', () => {
        const en = catalog.filter(l => l.subject === 'en');
        assert.deepEqual(en.map(l => l.id), ['what-day-is-it', 'have', 'school-premises', 'actions-in-class', 'my-school-bag']);
        assert.equal(byId('what-day-is-it').exam, '2026-11-13');
        assert.equal(byId('have').trackId, 'en');
        assert.ok(byId('what-day-is-it').cards.some(c => c.deckId === 'what-day-is-it-months'));
    });
    test('buildCatalog_TextDeck_IsDropped', () => {
        assert.equal(byId('halloween-poem'), undefined);
    });
    test('buildCatalog_Cards_KeepEnglishCardIds', () => {
        const all = new Set(expandCards(enDecks).map(c => c.id));
        for (const l of catalog.filter(x => x.subject === 'en')) for (const c of l.cards) assert.ok(all.has(c.id), c.id);
        assert.ok(byId('have').cards.every(c => c.skill === 'gap-pick'));
    });
    test('buildCatalog_Subject_UsesItsTrackId', () => {
        assert.deepEqual([byId('demo').subject, byId('demo').trackId, byId('demo').cards.length], ['demo', 'demo', 13]);
    });
});

describe('types', () => {
    test('missionTypes_VocabWithoutVoice_HasNone', () => {
        assert.deepEqual(missionTypes(byId('school-premises'), { hasVoice: false }), []);
        assert.deepEqual(missionTypes(byId('school-premises'), { hasVoice: true }), ['infiltration']);
        assert.deepEqual(missionTypes(byId('demo'), { hasVoice: false }), ['infiltration', 'sort']);
    });
    test('pickType_LastTypeSortAndInfiltrationPlayable_ReturnsInfiltration', () => {
        const { srs, learn } = empty();
        assert.equal(pickType({ lesson: byId('demo'), srs, learn, today: TODAY, lastType: 'sort', hasVoice: true }), 'infiltration');
    });
    test('pickType_NoLastType_ReturnsTheTypeWithMostToPlay', () => {
        const { srs, learn } = empty();
        assert.equal(pickType({ lesson: byId('demo'), srs, learn, today: TODAY, lastType: null, hasVoice: true }), 'sort');
    });
    test('pickType_OtherTypeHasNothing_ReturnsLastTypeAgain', () => {
        const srs = { cards: Object.fromEntries(byId('demo').cards.filter(c => c.kind === 'qa').map(c => [c.id, { box: 3, due: '2026-12-01', seen: 2, lapses: 0 }])), introduced: {} };
        const known = { cards: Object.fromEntries(byId('demo').cards.filter(c => c.kind === 'qa').map(c => [c.id, { lvl: 3, passed: 3, topDays: ['2026-11-01', '2026-11-05'] }])), formats: {} };
        assert.equal(pickType({ lesson: byId('demo'), srs, learn: known, today: TODAY, lastType: 'sort', hasVoice: true }), 'sort');
    });
});

describe('mission', () => {
    test('createMission_NoVoice_HasNoListenPickCard', () => {
        const m = createMission({ lesson: byId('school-premises'), type: 'infiltration', hasVoice: false });
        assert.equal(m.cards.length, 0);
        const withVoice = createMission({ lesson: byId('school-premises'), type: 'infiltration', hasVoice: true });
        assert.ok(withVoice.cards.length > 0 && withVoice.cards.every(c => c.skill === 'listen-pick'));
    });
    test('createMission_Sort_KeepsOnlySortCards', () => {
        const m = createMission({ lesson: byId('demo'), type: 'sort', hasVoice: true });
        assert.ok(m.cards.length === 9 && m.cards.every(c => c.kind === 'sort'));
        assert.deepEqual({ index: m.index, total: m.total, alarm: m.alarm, done: m.done }, { index: 0, total: 10, alarm: 0, done: false });
    });
    test('openLock_NoVoice_NeverReturnsHearFormat', () => {
        const { steps } = playMission(byId('what-day-is-it'), { hasVoice: false });
        assert.equal(steps.length, LOCKS);
        assert.ok(steps.every(s => s.format !== 'hear'));
    });
    test('openLock_FreshLesson_FirstRecordedStepIsNew', () => {
        const { steps } = playMission(byId('what-day-is-it'));
        const first = steps.find(s => s.record);
        assert.equal(first.isNew, true);
    });
    test('answerLock_RecordedMiss_RaisesAlarmAndOwesTheCardFourLocksLater', () => {
        const { srs, learn } = empty();
        let m = createMission({ lesson: byId('what-day-is-it'), type: 'infiltration', hasVoice: true });
        m = openLock(m, { srs, learn, today: TODAY, rng: seeded(), now: NOW });
        assert.equal(m.step.record, true);
        const out = answerLock(m, { srs, learn, result: 'miss', ms: 5000, typed: 'x', today: TODAY });
        assert.equal(out.mission.alarm, 1);
        assert.deepEqual(out.mission.owed, [{ cardId: m.step.card.id, notBefore: 4 }]);
        assert.deepEqual(out.mission.results, [{ cardId: m.step.card.id, result: 'miss', recorded: true }]);
        assert.equal(out.mission.index, 1);
        assert.equal(out.mission.newCount, 1);
    });
    test('answerLock_AlarmAfterFourMisses_IsCappedAt3', () => {
        const { mission } = playMission(byId('what-day-is-it'), { answer: () => 'miss' });
        assert.equal(mission.alarm, 3);
    });
    test('answerLock_UnrecordedStep_LeavesSrsAndLearnUntouched', () => {
        const { srs, learn } = playMission(byId('what-day-is-it'));
        let m = createMission({ lesson: byId('what-day-is-it'), type: 'infiltration', hasVoice: true });
        m = openLock(m, { srs, learn, today: TODAY, rng: seeded(), now: NOW });
        assert.equal(m.step.record, false);
        const out = answerLock(m, { srs, learn, result: 'miss', ms: 5000, typed: 'x', today: TODAY });
        assert.equal(out.srs, srs);
        assert.equal(out.learn, learn);
        assert.equal(out.mission.alarm, 0);
    });
    test('openLock_ComposerHasNothingLeft_SetsDone', () => {
        const one = { ...byId('demo'), cards: byId('demo').cards.slice(0, 1) };
        const { mission, steps } = playMission(one);
        assert.equal(mission.done, true);
        assert.equal(steps.length, 1);
        assert.equal(mission.step, null);
    });
    test('openLock_Training_NeverRecordsAndNeverRepeatsThePreviousCard', () => {
        const { mission, steps, srs, learn } = playMission(byId('demo'), { training: true });
        assert.equal(steps.length, LOCKS);
        assert.ok(steps.every(s => !s.record));
        for (let i = 1; i < steps.length; i++) assert.notEqual(steps[i].card.id, steps[i - 1].card.id);
        assert.deepEqual([srs.cards, learn.cards, stars(mission)], [{}, {}, 0]);
    });
    test('playWholeMission_SameAnswers_LeaveSameStateAsALessonSession', () => {
        const answer = (step, i) => (i % 3 === 1 ? 'miss' : i % 4 === 2 ? 'retry' : 'right');
        const lesson = byId('what-day-is-it');
        const game = playMission(lesson, { answer });
        // The same session through the English engine directly.
        let { srs, learn } = empty();
        let owed = [], newCount = 0;
        const history = [];
        const cards = createMission({ lesson, type: 'infiltration', hasVoice: true }).cards;
        for (let index = 0; index < LOCKS; index++) {
            const step = nextStep({ cards, srs, learn, today: TODAY, exam: lesson.exam, hasVoice: true, history, owed, index, total: LOCKS, newCount, rng: seeded(index + 1), now: NOW, table: LESSON_LADDER });
            if (!step) break;
            if (step.isNew) newCount++;
            history.push({ cardId: step.card.id, recorded: step.record });
            if (!step.record) continue;
            const out = applyStep({ learn, srs, step, result: answer(step, index), ms: 60000, typed: 'oops', today: TODAY, hasVoice: true, table: LESSON_LADDER });
            ({ learn, srs } = out);
            owed = afterAnswer({ owed, cardId: step.card.id, index, learning: out.learning });
        }
        assert.deepEqual(game.learn, learn);
        assert.deepEqual(game.srs, srs);
    });
    test('playWholeMission_WrittenItems_LeaveSameStateAsAnEnHtmlLessonSession', () => {
        // The reference is built as en.html's runLessonSession builds it: expandCards, the lesson's decks, no table.
        // Written groups only, since en.html would also play the microphone cards the game leaves out.
        const decks = lessonFiles.flatMap(flattenLesson).filter(d => d.lesson.id === 'what-day-is-it' && ['spell', 'write'].includes(d.kind));
        const enCards = expandCards(decks);
        const lesson = { ...byId('what-day-is-it'), cards: byId('what-day-is-it').cards.filter(c => ['spell', 'write'].includes(c.kind)) };
        const answer = (step, i) => (i % 3 === 1 ? 'miss' : i % 4 === 2 ? 'retry' : 'right');
        const game = playMission(lesson, { answer });
        let { srs, learn } = empty();
        let owed = [], newCount = 0;
        const history = [];
        for (let index = 0; index < LOCKS; index++) {
            const step = nextStep({ cards: enCards, srs, learn, today: TODAY, exam: lesson.exam, hasVoice: true, history, owed, index, total: LOCKS, newCount, rng: seeded(index + 1), now: NOW });
            if (!step) break;
            if (step.isNew) newCount++;
            history.push({ cardId: step.card.id, recorded: step.record });
            if (!step.record) continue;
            const out = applyStep({ learn, srs, step, result: answer(step, index), ms: 60000, typed: 'oops', today: TODAY, hasVoice: true });
            ({ learn, srs } = out);
            owed = afterAnswer({ owed, cardId: step.card.id, index, learning: out.learning });
        }
        assert.deepEqual(game.learn, learn);
        assert.deepEqual(game.srs, srs);
    });
    test('canRecord_FreshLesson_ReturnsTrue', () => {
        const { srs, learn } = empty();
        assert.equal(canRecord({ lesson: byId('demo'), type: 'sort', srs, learn, today: TODAY, hasVoice: true }), true);
    });
    test('canRecord_EverythingKnownAndNotDue_ReturnsFalse', () => {
        const lesson = byId('demo');
        const srs = { cards: Object.fromEntries(lesson.cards.map(c => [c.id, { box: 3, due: '2026-12-01', seen: 2, lapses: 0 }])), introduced: {} };
        const learn = { cards: Object.fromEntries(lesson.cards.filter(c => c.kind === 'qa').map(c => [c.id, { lvl: 3, passed: 3, topDays: ['2026-11-01', '2026-11-05'] }])), formats: {} };
        assert.equal(canRecord({ lesson, type: 'sort', srs, learn, today: TODAY, hasVoice: true }), false);
        assert.equal(canRecord({ lesson, type: 'infiltration', srs, learn, today: TODAY, hasVoice: true }), false);
    });
});

describe('results', () => {
    const withResults = (pairs) => ({ results: pairs.map(([result, recorded]) => ({ cardId: 'x', result, recorded })) });
    test('stars_NoRecordedLock_Returns0', () => {
        assert.equal(stars(withResults([['right', false], ['right', false]])), 0);
    });
    test('stars_SixOfSevenRight_Returns3', () => {
        assert.equal(stars(withResults([['right', false], ...Array(6).fill(['right', true]), ['miss', true]])), 3);
    });
    test('stars_FiveOfSevenRight_Returns2', () => {
        assert.equal(stars(withResults([...Array(5).fill(['right', true]), ['retry', true], ['miss', true]])), 2);
    });
    test('stars_FourOfSevenRight_Returns1', () => {
        assert.equal(stars(withResults([...Array(4).fill(['right', true]), ...Array(3).fill(['miss', true])])), 1);
    });
    test('missed_RecordedMisses_GivesCueAndModelOnce', () => {
        const lesson = byId('demo');
        const q = lesson.cards[0], s = lesson.cards.find(c => c.kind === 'sort');
        const m = { results: [{ cardId: q.id, result: 'miss', recorded: true }, { cardId: q.id, result: 'miss', recorded: true },
            { cardId: s.id, result: 'miss', recorded: true }, { cardId: lesson.cards[1].id, result: 'miss', recorded: false }] };
        assert.deepEqual(missed(m, lesson.cards), [
            { cue: q.item.q, model: q.item.a },
            { cue: 'le lait', model: 'Origine animale' },
        ]);
    });
});

describe('exerciseFor', () => {
    test('exerciseFor_SortCard_CarriesItsGroupCats', () => {
        const card = byId('demo').cards.find(c => c.kind === 'sort');
        const ex = exerciseFor({ card, level: null, format: null, record: true }, { cards: byId('demo').cards, rng: seeded() });
        assert.deepEqual({ type: ex.type, cardId: ex.cardId, label: ex.label, cat: ex.cat }, { type: 'sort', cardId: card.id, label: 'le lait', cat: 'animale' });
        assert.equal(ex.cats.length, 3);
    });
    test('exerciseFor_EachKind_GivesItsExercise', () => {
        const pick = (lessonId, kind) => byId(lessonId).cards.find(c => c.kind === kind);
        const types = [
            exerciseFor({ card: pick('what-day-is-it', 'spell'), level: 1, format: 'pick' }, { cards: byId('what-day-is-it').cards, rng: seeded(), now: NOW }).type,
            exerciseFor({ card: pick('what-day-is-it', 'grammar'), level: null, format: null }, { cards: byId('what-day-is-it').cards, rng: seeded() }).type,
            exerciseFor({ card: pick('school-premises', 'vocab'), level: null, format: null }, { cards: byId('school-premises').cards, rng: seeded() }).type,
            exerciseFor({ card: pick('demo', 'qa'), level: 2, format: 'cloze' }, { cards: byId('demo').cards, rng: seeded() }).type,
        ];
        assert.deepEqual(types, ['pick', 'gap-pick', 'listen-pick', 'cloze']);
    });
});

describe('progress', () => {
    test('progressOf_FreshLesson_EverythingNew', () => {
        const { srs, learn } = empty();
        assert.deepEqual(progressOf(byId('demo'), { srs, learn, hasVoice: true }), { mastered: 0, known: 0, learning: 0, new: 13 });
    });
    test('progressOf_MixedStates_CountsEachOnce', () => {
        const lesson = byId('demo');
        const [q1, q2, q3] = lesson.cards;
        const [s1, s2, s3] = lesson.cards.filter(c => c.kind === 'sort');
        const learn = { cards: {
            [q1.id]: { lvl: 3, passed: 3, topDays: ['2026-11-01', '2026-11-02'] },
            [q2.id]: { lvl: 3, passed: 3, topDays: ['2026-11-01'] },
            [q3.id]: { lvl: 2, passed: 1, topDays: [] },
        }, formats: {} };
        const srs = { cards: { [s1.id]: { box: 3, due: '2026-12-01' }, [s2.id]: { box: 2, due: '2026-12-01' }, [s3.id]: { box: 1, due: TODAY } }, introduced: {} };
        assert.deepEqual(progressOf(lesson, { srs, learn, hasVoice: true }), { mastered: 2, known: 2, learning: 2, new: 7 });
    });
    test('needCount_FreshLesson_CountsEveryPlayableCard', () => {
        const { srs, learn } = empty();
        assert.equal(needCount(byId('school-premises'), { srs, learn, today: TODAY, hasVoice: false }), 0);
        assert.equal(needCount(byId('demo'), { srs, learn, today: TODAY, hasVoice: false }), 13);
    });
});
