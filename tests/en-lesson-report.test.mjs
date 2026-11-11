import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LESSON_FILES, flattenLesson, expandCards } from '../assets/en/decks/index.js';
import { lessonReport, reportText } from '../assets/en/lesson-report.js';
import { initial } from '../assets/en/ladder.js';

const lesson = JSON.parse(await readFile(new URL(`../assets/en/decks/${LESSON_FILES[0]}.json`, import.meta.url), 'utf8'));
const decks = flattenLesson(lesson);
const cards = expandCards(decks);
const meta = decks[0].lesson;
const id = (group, item) => `what-day-is-it-${group}/${item}#write`;
const NOW = new Date(2026, 10, 11, 18, 0);
const learn = () => ({
    formats: {},
    cards: {
        [id('days', 'monday')]: { ...initial('spell'), lvl: 3, passed: 3, topDays: ['2026-11-10', '2026-11-11'], last: 'Munday' },
        [id('days', 'tuesday')]: { ...initial('spell'), lvl: 3, passed: 3, topDays: ['2026-11-11'] },
        [id('days', 'thursday')]: { ...initial('spell'), lvl: 2, passed: 1, last: 'Tursday' },
        [id('days', 'friday')]: { ...initial('spell'), lvl: 1, last: 'Fryday' },
        [id('dates', 'mon-sep-7')]: { ...initial('write'), lvl: 4, passed: 3, last: 'monday september 7th' },
        'gone/item#write': { ...initial('spell'), lvl: 2, last: 'x' },
    },
});

describe('lessonReport', () => {
    test('lessonReport_MixedStates_CountsPerLevelKnownAndMastered', () => {
        const r = lessonReport({ lesson: meta, cards, learn: learn(), now: NOW });
        const written = cards.filter(c => ['spell', 'write'].includes(c.kind)).length;
        assert.equal(r.total, written);
        assert.deepEqual([r.known, r.mastered], [2, 1]);
        assert.deepEqual(r.byLevel, { new: written - 5, 1: 1, 2: 1, 3: 2, 4: 1 });
        assert.equal(r.exam, '2026-11-13');
    });
    test('lessonReport_WatchList_LastTypedOfUnmasteredItemsLowestLevelFirst', () => {
        const r = lessonReport({ lesson: meta, cards, learn: learn(), now: NOW });
        assert.deepEqual(r.watch, [
            { model: 'Friday', typed: 'Fryday', level: 1 },
            { model: 'Thursday', typed: 'Tursday', level: 2 },
            { model: 'Monday, September 7th', typed: 'monday september 7th', level: 4 },
        ]);
    });
    test('lessonReport_WithoutVoice_PhraseLevelCappedAtThree', () => {
        const r = lessonReport({ lesson: meta, cards, learn: learn(), hasVoice: false, now: NOW });
        assert.deepEqual([r.byLevel[3], r.byLevel[4]], [3, 0]);
    });
    test('lessonReport_NothingPlayed_AllNew', () => {
        const r = lessonReport({ lesson: meta, cards, learn: { cards: {}, formats: {} }, now: NOW });
        assert.deepEqual([r.known, r.mastered, r.watch.length, r.byLevel.new], [0, 0, 0, r.total]);
    });
});

describe('reportText', () => {
    test('reportText_ListsLessonExamCountsAndWatchedItems', () => {
        const text = reportText(lessonReport({ lesson: meta, cards, learn: learn(), now: NOW }), '2026-11-11');
        assert.match(text, /^Bilan de la leçon « What day is it\?/);
        assert.match(text, /Contrôle : 2026-11-13/);
        assert.match(text, /2 écrits de mémoire, dont 1 acquis/);
        assert.match(text, /- Thursday ← « Tursday » \(niveau 2, compléter\)/);
        assert.doesNotMatch(text, /Munday/);
    });
    test('reportText_NothingToWatch_SaysSo', () => {
        const text = reportText(lessonReport({ lesson: meta, cards, learn: { cards: {}, formats: {} }, now: NOW }), '2026-11-11');
        assert.match(text, /Rien à surveiller/);
    });
});
