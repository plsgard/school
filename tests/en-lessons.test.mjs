import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LESSON_FILES, DECK_FILES, flattenLesson, expandCards, loadDecks } from '../assets/en/decks/index.js';
import { generateLesson, fillPattern, tilesFor, joinTiles } from '../assets/en/lesson-generators.js';
import { checkAnswer, strictFor } from '../assets/en/answer.js';
import { formatDate, spokenDate, ordinalSuffix, resolveItem } from '../assets/en/today.js';

const read = async (n) => JSON.parse(await readFile(new URL(`../assets/en/decks/${n}.json`, import.meta.url), 'utf8'));
const lessons = await Promise.all(LESSON_FILES.map(read));
const decks = lessons.flatMap(flattenLesson);
const cards = expandCards(decks);
const learnDecks = decks.filter(d => ['spell', 'write'].includes(d.kind));
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const card = (id) => cards.find(c => c.id === id);
const NOW = new Date(2026, 10, 11, 18, 0); // Wednesday 11 November 2026

describe('lesson files', () => {
    test('flattenLesson_Groups_DeckIdsAndLessonMeta', () => {
        const d = decks.find(x => x.id === 'what-day-is-it-days');
        assert.equal(d.kind, 'spell');
        assert.deepEqual(d.lesson, { id: 'what-day-is-it', label: lessons[0].label, exam: '2026-11-13', source: lessons[0].source });
        assert.deepEqual(decks.find(x => x.id === 'what-day-is-it-suffix').items[0].strict, { spelling: true });
    });
    test('loadDecks_LessonsFirstThenDecks', async () => {
        const all = await loadDecks(async (url) => ({ json: async () => read(url.split('/').pop().replace('.json', '')) }));
        assert.equal(all[0].lesson.id, LESSON_FILES[0]);
        assert.deepEqual(all.filter(d => !d.lesson).map(d => d.id), DECK_FILES);
    });
    test('lessons_EveryLesson_HasIdLabelGroupsAndValidExam', () => {
        for (const l of lessons) {
            assert.match(l.id, /^[a-z0-9-]+$/);
            assert.ok(l.label && l.source && l.groups.length, l.id);
            if (l.exam != null) {
                assert.match(l.exam, /^\d{4}-\d{2}-\d{2}$/);
                assert.equal(new Date(`${l.exam}T00:00:00Z`).toISOString().slice(0, 10), l.exam);
            }
            assert.equal(new Set(l.groups.map(g => g.id)).size, l.groups.length, 'group ids unique');
            for (const g of l.groups) assert.ok(['spell', 'write', 'vocab', 'grammar', 'text'].includes(g.kind), g.id);
        }
    });
    test('lessons_EveryItem_ValidIdsCueAnswers', () => {
        for (const d of learnDecks) {
            assert.ok(d.label && d.consigne, d.id);
            const ids = new Set();
            for (const it of d.items) {
                assert.match(it.id, /^[a-z0-9-]+$/);
                assert.equal(ids.has(it.id), false, `${d.id}/${it.id}`); ids.add(it.id);
                assert.ok(it.cue?.trim(), `${d.id}/${it.id}: cue`);
                if (it.dynamic) { assert.equal(it.dynamic, 'today'); continue; }
                assert.ok(Array.isArray(it.en) && it.en.length && it.en.every(x => typeof x === 'string' && x.trim()), `${d.id}/${it.id}: en`);
            }
        }
    });
    test('lessons_GrammarGroups_GapFilledIsAnAcceptedAnswer', () => {
        for (const it of decks.filter(d => d.kind === 'grammar').flatMap(d => d.items)) {
            assert.equal(it.gap.split('___').length, 2, it.id);
            assert.equal(new Set(it.options).size, 3, it.id);
            assert.ok(it.options.includes(it.answer), it.id);
            assert.ok(it.en.includes(it.gap.replace('___', it.answer)), it.id);
            assert.equal(it.fr, undefined, `${it.id}: a French cue would add a microphone card`);
        }
    });
    test('lessons_Slips_NeverAccepted', () => {
        for (const d of learnDecks) for (const it of d.items) for (const slip of it.slips ?? []) {
            assert.notEqual(checkAnswer(it.en, slip, strictFor(d.kind, it)).outcome, 'right', `${d.id}/${it.id}: ${slip}`);
        }
    });
    test('lessons_SpellItems_HaveThreeDistractors', () => {
        for (const c of cards.filter(c => c.kind === 'spell')) {
            const ex = generateLesson(c, { format: 'pick', cards, rng: seeded(5), now: NOW });
            assert.equal(ex.choices.length, 4, c.id);
            assert.equal(new Set(ex.choices.map(x => x.text)).size, 4, c.id);
        }
    });
    test('lessons_DatesGroup_CoversEveryDayAndMonth', () => {
        const models = decks.find(d => d.id === 'what-day-is-it-dates').items.map(i => i.en[0]).join(' ');
        const words = (id) => decks.find(d => d.id === id).items.map(i => i.en[0]);
        for (const w of [...words('what-day-is-it-days'), ...words('what-day-is-it-months')]) assert.ok(models.includes(w), w);
    });
    test('lessons_Dates_WrittenFormMatchesSpokenForm', () => {
        for (const it of decks.find(d => d.id === 'what-day-is-it-dates').items) {
            const m = it.en[0].match(/^(\w+), (\w+) (\d+)(st|nd|rd|th)$/);
            assert.ok(m, it.id);
            assert.equal(m[4], ordinalSuffix(Number(m[3])), it.id);
            // Any year: the spoken form only depends on the day number.
            const d = new Date(2026, 0, Number(m[3]));
            assert.equal(it.hear, `${m[1]}, ${m[2]} the ${spokenDate(d).split(' the ')[1]}`, it.id);
        }
    });
    test('expandCards_SpellAndWrite_OneWriteCardPerItem', () => {
        const days = cards.filter(c => c.deckId === 'what-day-is-it-days');
        assert.equal(days.length, 7);
        assert.equal(days[0].id, 'what-day-is-it-days/monday#write');
        assert.ok(cards.filter(c => ['spell', 'write'].includes(c.kind)).every(c => c.skill === 'write'));
    });
});

describe('generateLesson', () => {
    const thursday = card('what-day-is-it-days/thursday#write');
    const date = card('what-day-is-it-dates/wed-apr-12#write');
    test('generateLesson_Pick_FourChoicesOneCorrect', () => {
        const ex = generateLesson(thursday, { format: 'pick', cards, rng: seeded(2), now: NOW });
        assert.deepEqual(ex.choices.filter(x => x.correct).map(x => x.text), ['Thursday']);
        assert.deepEqual(ex.choices.map(x => x.text).sort(), ['Thirsday', 'Thurday', 'Thursday', 'Tursday']);
        assert.equal(ex.cue, 'jeudi');
    });
    test('generateLesson_Pick2_ModelAndItsMostTypicalSlip', () => {
        const ex = generateLesson(thursday, { format: 'pick2', cards, rng: seeded(2), now: NOW });
        assert.deepEqual(ex.choices.map(x => x.text).sort(), ['Thursday', 'Tursday']);
    });
    test('generateLesson_Type_CarriesAcceptedStrictAndConfusables', () => {
        const ex = generateLesson(thursday, { format: 'type', cards, now: NOW });
        assert.deepEqual(ex.accepted, ['Thursday']);
        assert.deepEqual(ex.strict, { case: true, punct: false });
        assert.ok(ex.confusables.includes('Tuesday') && !ex.confusables.includes('Thursday'));
        assert.equal(ex.consigne, 'Écris ce jour en anglais.');
    });
    test('generateLesson_Hear_SaysTheSpokenFormAndHidesTheCue', () => {
        const ex = generateLesson(date, { format: 'hear', cards, now: NOW });
        assert.equal(ex.say, 'Wednesday, April the twelfth');
        assert.equal(ex.cue, null);
        assert.deepEqual(ex.strict, { case: true, punct: true });
    });
    test('generateLesson_UnknownFormat_Throws', () => {
        assert.throws(() => generateLesson(thursday, { format: 'sing', cards, now: NOW }));
    });
    test('generateLesson_EveryCardEveryFormat_Builds', () => {
        for (const c of cards.filter(c => ['spell', 'write'].includes(c.kind))) {
            for (const f of ['fill', 'tiles', 'type', 'cover', 'hear']) {
                const ex = generateLesson(c, { format: f, cards, rng: seeded(9), now: NOW });
                if (f === 'fill') {
                    assert.equal(ex.pattern.length, ex.model.length, c.id);
                    assert.ok(ex.pattern.includes('_'), `${c.id}: ${ex.pattern}`);
                    assert.notEqual(ex.pattern.replace(/[^_]/g, '').length, ex.model.replace(/[^a-z0-9]/gi, '').length, `${c.id}: not everything hidden`);
                }
                if (f === 'tiles') {
                    const sorted = (a) => a.slice().sort().join('|');
                    const ordered = tilesFor(c.kind, ex.model, () => 0.999999).tiles; // identity shuffle would loop: just the multiset
                    assert.equal(sorted(ex.tiles), sorted(ordered), c.id);
                }
            }
        }
    });
});

describe('fillPattern', () => {
    test('fillPattern_Spell_HidesWhereTheSlipsGoWrongAndKeepsTheFirstLetter', () => {
        const p = fillPattern('spell', 'Thursday', ['Tursday', 'Thurday', 'Thirsday'], seeded(1));
        assert.equal(p[0], 'T');
        assert.equal(p[1], '_', p); // "Tursday": the h
        assert.equal(p[2], '_', p); // "Thirsday": the u
    });
    test('fillPattern_SpellWithArticle_OnlyTheLastWordHasBlanks', () => {
        const p = fillPattern('spell', 'the twenty-first', ['the twenty-firt'], seeded(1));
        assert.ok(p.startsWith('the twenty-f'), p);
    });
    test('fillPattern_Suffix_HidesTheLetters', () => {
        assert.equal(fillPattern('spell', '3rd', ['3nd', '3st', '3th'], seeded(1)), '3__');
    });
    test('fillPattern_Write_HidesOneWordOfAThreeWordDate', () => {
        const p = fillPattern('write', 'Wednesday, April 12th', [], seeded(4));
        const hidden = p.split(' ').filter(t => t.includes('_'));
        assert.equal(hidden.length, 1, p);
        assert.equal(p.length, 'Wednesday, April 12th'.length);
    });
});

describe('tiles', () => {
    test('tilesFor_Write_PunctuationIsItsOwnTileAndJoinRebuildsTheModel', () => {
        const { prefix, tiles } = tilesFor('write', 'Wednesday, April 12th', seeded(3));
        assert.equal(prefix, '');
        assert.deepEqual(tiles.slice().sort(), [',', '12th', 'April', 'Wednesday']);
        assert.notDeepEqual(tiles, ['Wednesday', ',', 'April', '12th']);
        assert.equal(joinTiles('write', '', ['Wednesday', ',', 'April', '12th']), 'Wednesday, April 12th');
        assert.equal(joinTiles('write', '', ['What', 'day', 'is', 'it', 'today', '?']), 'What day is it today?');
    });
    test('tilesFor_SpellWithArticle_KeepsThePrefixInPlace', () => {
        const { prefix, tiles } = tilesFor('spell', 'the twenty-first', seeded(3));
        assert.equal(prefix, 'the twenty-');
        assert.equal(tiles.slice().sort().join(''), 'first'.split('').sort().join(''));
        assert.equal(joinTiles('spell', prefix, [...'first']), 'the twenty-first');
    });
});

describe('today', () => {
    test('ordinalSuffix_FirstSecondThirdTeensAndTwenties', () => {
        assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(n => `${n}${ordinalSuffix(n)}`),
            ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st']);
    });
    test('formatDate_AWednesday_LessonForm', () => {
        assert.equal(formatDate(NOW), 'Wednesday, November 11th');
        assert.equal(spokenDate(new Date(2026, 6, 21)), 'Tuesday, July the twenty-first');
    });
    test('resolveItem_Today_AcceptsSentenceAndBareDate', () => {
        const it = resolveItem({ id: 'today', dynamic: 'today', cue: 'What day is it today?' }, NOW);
        assert.deepEqual(it.en, ['Today is Wednesday, November 11th.', 'Today is Wednesday, November 11th', 'Wednesday, November 11th']);
        assert.equal(it.hear, 'Today is Wednesday, November the eleventh.');
        const plain = { id: 'x', en: ['a'] };
        assert.equal(resolveItem(plain, NOW), plain);
    });
});
