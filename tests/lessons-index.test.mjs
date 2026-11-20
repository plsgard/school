import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SUBJECTS, LESSON_LADDER, loadLessons, expandLessonCards, validateLesson } from '../assets/lessons/index.js';
import { flattenLesson } from '../assets/en/decks/index.js';
import { EN_LADDER, startLevel, topLevel } from '../assets/en/ladder.js';

const fixture = JSON.parse(await readFile(new URL('./helpers/lesson-fixture.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);
const qa = (l) => l.groups.find(g => g.id === 'questions');
const sort = (l) => l.groups.find(g => g.id === 'origine');
const fakeFetch = (files) => async (url) => ({ json: async () => structuredClone(files[url]) });

describe('ladder', () => {
    test('LESSON_LADDER_Qa_Runs1To3AndKeepsEnglishKinds', () => {
        assert.deepEqual([startLevel('qa', LESSON_LADDER), topLevel('qa', true, LESSON_LADDER)], [1, 3]);
        assert.equal(LESSON_LADDER.formats.spell, EN_LADDER.formats.spell);
        assert.equal(topLevel('write', true, LESSON_LADDER), 4);
    });
});

describe('loadLessons', () => {
    test('loadLessons_OneFile_FlattensGroupsAndKeepsSortCats', async () => {
        const saved = SUBJECTS.demo;
        SUBJECTS.demo = ['demo'];
        try {
            const decks = await loadLessons('demo', fakeFetch({ 'x/demo/demo.json': fixture }), 'x');
            assert.deepEqual(decks.map(d => d.id), ['demo-questions', 'demo-origine']);
            assert.equal(decks[1].cats.length, 3);
            assert.equal(decks[0].lesson.id, 'demo');
        } finally { if (saved) SUBJECTS.demo = saved; else delete SUBJECTS.demo; }
    });
    test('loadLessons_UnknownSubject_ReturnsEmpty', async () => {
        assert.deepEqual(await loadLessons('nope', fakeFetch({})), []);
    });
});

describe('expandLessonCards', () => {
    test('expandLessonCards_Fixture_GivesOneCardPerItemWithStableIds', () => {
        const cards = expandLessonCards(flattenLesson(fixture).map((d, i) => ({ ...d, cats: fixture.groups[i].cats })));
        assert.equal(cards.length, 13);
        assert.equal(cards[0].id, 'demo-questions/q1#answer');
        assert.deepEqual([cards[0].kind, cards[0].skill], ['qa', 'answer']);
        assert.equal(cards[4].id, 'demo-origine/lait#sort');
        assert.deepEqual([cards[4].kind, cards[4].skill], ['sort', 'sort']);
    });
    test('expandLessonCards_OtherKind_GivesNoCard', () => {
        assert.deepEqual(expandLessonCards([{ id: 'x', kind: 'order', items: [{ id: 'a' }] }]), []);
    });
});

describe('validateLesson', () => {
    test('validateLesson_Fixture_ReturnsNoError', () => {
        assert.deepEqual(validateLesson(fixture), []);
    });
    test('validateLesson_DuplicateItemId_ReportsIt', () => {
        const l = copy(); sort(l).items[1].id = 'lait';
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_QaWithoutAnswer_ReportsIt', () => {
        const l = copy(); delete qa(l).items[0].a;
        assert.ok(validateLesson(l).some(e => e.includes('q1')));
    });
    test('validateLesson_QaWithTwoWrong_ReportsIt', () => {
        const l = copy(); qa(l).items[0].wrong.pop();
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_AnswerFailsItsKeys_ReportsIt', () => {
        const l = copy(); qa(l).items[0].keys.push(['reine']);
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_ClozeNotInAnswer_ReportsIt', () => {
        const l = copy(); qa(l).items[2].cloze = 'érable';
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_NoKeyWrittenAsInTheAnswer_ReportsNoCloze', () => {
        // 'reine' passes the key 'reines' (one letter off), but the cloze needs the key written in the answer.
        const l = copy(); qa(l).items[0].keys = [['reines']]; qa(l).items[0].a = 'Le miel est fait pour une reine.';
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_WrongChoicePassesTheKeys_ReportsIt', () => {
        const l = copy(); qa(l).items[0].wrong[0] = 'Les abeilles le volent.';
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_SortWithOneCat_ReportsIt', () => {
        const l = copy(); sort(l).cats = [sort(l).cats[0]]; sort(l).items = sort(l).items.filter(i => i.cat === 'animale');
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_SortWithFiveCats_ReportsIt', () => {
        const l = copy(); sort(l).cats.push({ id: 'a', label: 'A' }, { id: 'b', label: 'B' });
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_SortItemWithUnknownCat_ReportsIt', () => {
        const l = copy(); sort(l).items[0].cat = 'lunaire';
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_OtherKind_ReportsIt', () => {
        const l = copy(); l.groups.push({ id: 'x', kind: 'order', items: [] });
        assert.equal(validateLesson(l).length, 1);
    });
    test('validateLesson_EverySubjectLesson_ReturnsNoError', async () => {
        for (const [subject, ids] of Object.entries(SUBJECTS)) {
            for (const id of ids) {
                const lesson = JSON.parse(await readFile(new URL(`../assets/lessons/${subject}/${id}.json`, import.meta.url), 'utf8'));
                assert.equal(lesson.id, id);
                assert.deepEqual(validateLesson(lesson), [], `${subject}/${id}`);
            }
        }
    });
});
