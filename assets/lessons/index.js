// assets/lessons/index.js
// Lessons of other subjects than English (SVT, then physics, French…): one JSON per lesson under
// assets/lessons/<subject>/<id>.json, in the envelope of the English lessons (id, label, source, exam, groups).
// Two group kinds of their own (README "Add a lesson for another subject"):
//   qa:   { id, q, a, keys: [[alternatives] per idea], wrong: [3 plausible wrong answers], cloze? }   skill 'answer'
//   sort: group { cats: [{ id, label, emoji }] }, item { id, label, emoji?, cat }                    skill 'sort'
// A 'qa' card climbs the written ladder (LESSON_LADDER: pick → cloze → sentence); a 'sort' card is a plain Leitner
// card. Card ids follow the English shape `<lesson>-<group>/<item>#<skill>`; an item id is never renamed.
import { flattenLesson } from '../en/decks/index.js';
import { EN_LADDER } from '../en/ladder.js';
import { checkSentence, clozeOf } from './qa.js';

// Lesson ids per subject, the current lesson first.
export const SUBJECTS = { svt: ['alimentation-humaine'] };

// The English ladder plus 'qa': other subjects run on the English lesson engine with this table.
export const LESSON_LADDER = {
    ...EN_LADDER,
    formats: { ...EN_LADDER.formats, qa: { 1: ['pick'], 2: ['cloze'], 3: ['sentence'] } },
    top: (kind, hasVoice) => (kind === 'qa' ? 3 : EN_LADDER.top(kind, hasVoice)),
};

const SKILLS = { qa: 'answer', sort: 'sort' };

// flattenLesson keeps the English deck shape; a sort group also needs its categories.
export const flattenSubjectLesson = (lesson) =>
    flattenLesson(lesson).map((deck, i) => (lesson.groups[i].cats ? { ...deck, cats: lesson.groups[i].cats } : deck));

export async function loadLessons(subject, fetchImpl = fetch, base = 'assets/lessons') {
    const ids = SUBJECTS[subject] ?? [];
    const lessons = await Promise.all(ids.map(async (id) => (await fetchImpl(`${base}/${subject}/${id}.json`)).json()));
    return lessons.flatMap(flattenSubjectLesson);
}

export function expandLessonCards(decks) {
    return decks.flatMap(deck => {
        const skill = SKILLS[deck.kind];
        if (!skill) return [];
        return deck.items.map(item => ({ id: `${deck.id}/${item.id}#${skill}`, deckId: deck.id, kind: deck.kind, skill, item, deck }));
    });
}

// Every problem of a lesson file, one string each; [] = valid. Run on every shipped file by the tests.
export function validateLesson(lesson) {
    const errors = [];
    for (const g of lesson.groups ?? []) {
        const at = (it) => `${g.id}/${it?.id ?? '?'}`;
        if (!SKILLS[g.kind]) { errors.push(`${g.id}: unknown kind ${g.kind}`); continue; }
        const seen = new Set();
        for (const it of g.items ?? []) {
            if (seen.has(it.id)) errors.push(`${at(it)}: duplicate id`);
            seen.add(it.id);
        }
        if (g.kind === 'qa') {
            for (const it of g.items ?? []) {
                if (!it.q || !it.a || !Array.isArray(it.keys) || !it.keys.length) { errors.push(`${at(it)}: needs q, a and keys`); continue; }
                if ((it.wrong ?? []).length < 3) errors.push(`${at(it)}: needs 3 wrong answers`);
                if (checkSentence(it.keys, it.a).outcome !== 'right') errors.push(`${at(it)}: the answer fails its own keys`);
                if (!clozeOf(it)) errors.push(it.cloze ? `${at(it)}: cloze "${it.cloze}" is not in the answer` : `${at(it)}: no key written in the answer (cloze)`);
                for (const w of it.wrong ?? []) if (checkSentence(it.keys, w).outcome === 'right') errors.push(`${at(it)}: wrong answer passes the keys: ${w}`);
            }
        } else if (g.kind === 'sort') {
            const cats = new Set((g.cats ?? []).map(c => c.id));
            if (cats.size < 2) errors.push(`${g.id}: a sort group needs 2 categories`);
            else for (const it of g.items ?? []) if (!cats.has(it.cat)) errors.push(`${at(it)}: unknown category ${it.cat}`);
        }
    }
    return errors;
}
