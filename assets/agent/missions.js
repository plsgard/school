// assets/agent/missions.js
// Pure: lessons → missions of Agent L. A mission is exactly a lesson session of the English engine
// (lesson-session.js nextStep / applyStep, with LESSON_LADDER so 'qa' climbs too) of LOCKS exercises: each exercise
// is one lock. The game never overrides the composer, so the same answers leave the same learn / srs state as in
// en.html. Slots 0, 1 and the last are the composer's unrecorded replays (the outer gates and the exit lock).
import { nextStep, afterAnswer, applyStep, inLearning } from '../en/lesson-session.js';
import { generateLesson } from '../en/lesson-generators.js';
import { generate } from '../en/generators.js';
import { expandCards } from '../en/decks/index.js';
import { resolveItem } from '../en/today.js';
import { isMastered, isLearnKind, initial, pickFormat, topLevel, startLevel } from '../en/ladder.js';
import { generateQa } from '../lessons/qa.js';
import { LESSON_LADDER, expandLessonCards } from '../lessons/index.js';

export const LOCKS = 10;
export const TYPE_KINDS = { infiltration: ['spell', 'write', 'grammar', 'vocab', 'qa'], sort: ['sort'] };
// say-it, line-repeat and line-next need the microphone: they stay in en.html.
export const PLAYABLE_SKILLS = ['write', 'gap-pick', 'listen-pick', 'answer', 'sort'];
export const TYPES = Object.keys(TYPE_KINDS);

const isLearn = (card) => isLearnKind(card.kind, LESSON_LADDER);

// enDecks: English decks (lesson groups carry `lesson`); subjects: { [subject]: flattened decks }.
export function buildCatalog({ enDecks = [], subjects = {} }) {
    const lessons = new Map();
    const add = (subject, deck, cards) => {
        const id = deck.lesson?.id ?? deck.id;
        if (!lessons.has(id)) {
            lessons.set(id, { id, subject, trackId: subject, label: deck.lesson?.label ?? deck.label ?? id,
                exam: deck.lesson?.exam ?? null, cards: [] });
        }
        lessons.get(id).cards.push(...cards.filter(c => PLAYABLE_SKILLS.includes(c.skill)));
    };
    for (const deck of enDecks) add('en', deck, expandCards([deck]));
    for (const [subject, decks] of Object.entries(subjects)) for (const deck of decks) add(subject, deck, expandLessonCards([deck]));
    return [...lessons.values()].filter(l => l.cards.length);
}

const playable = (cards, type, hasVoice) =>
    cards.filter(c => TYPE_KINDS[type].includes(c.kind) && (c.skill !== 'listen-pick' || hasVoice));

export const missionTypes = (lesson, { hasVoice }) => TYPES.filter(t => playable(lesson.cards, t, hasVoice).length);

// New, due, or still on the written ladder: what a run would work on.
export function needs(card, { srs, learn, today, hasVoice }) {
    const known = srs.cards[card.id];
    if (isLearn(card)) {
        const st = learn.cards[card.id];
        if (!st) return true;
        if (inLearning(st, card.kind, topLevel(card.kind, hasVoice, LESSON_LADDER), LESSON_LADDER)) return true;
        return !!known && known.due <= today;
    }
    return !known || known.due <= today;
}

export const needCount = (lesson, { srs, learn, today, hasVoice, type = null }) =>
    (type ? playable(lesson.cards, type, hasVoice) : lesson.cards.filter(c => c.skill !== 'listen-pick' || hasVoice))
        .filter(c => needs(c, { srs, learn, today, hasVoice })).length;

// The type with the most to work on; never the last one when another type has something to work on.
export function pickType({ lesson, srs, learn, today, lastType = null, hasVoice }) {
    const types = missionTypes(lesson, { hasVoice });
    if (!types.length) return null;
    const count = Object.fromEntries(types.map(t => [t, needCount(lesson, { srs, learn, today, hasVoice, type: t })]));
    const others = types.filter(t => t !== lastType && count[t] > 0);
    const pool = others.length ? others : types;
    return pool.reduce((best, t) => (count[t] > count[best] ? t : best), pool[0]);
}

export function createMission({ lesson, type, hasVoice, training = false }) {
    return {
        lessonId: lesson.id, trackId: lesson.trackId, type, cards: playable(lesson.cards, type, hasVoice), exam: lesson.exam ?? null,
        training, hasVoice, index: 0, total: LOCKS, history: [], owed: [], newCount: 0, alarm: 0, results: [], credits: 0,
        step: null, done: false,
    };
}

const composerArgs = (mission, { srs, learn, today, rng, now }) => ({
    cards: mission.cards, srs, learn, today, exam: mission.exam, hasVoice: mission.hasVoice, history: mission.history,
    owed: mission.owed, index: mission.index, total: mission.total, newCount: mission.newCount, rng, now, table: LESSON_LADDER,
});

// Would lock 2 be recorded? False: nothing new, due or learning, so the beacon offers a training run.
export function canRecord({ lesson, type, srs, learn, today, hasVoice }) {
    const mission = { ...createMission({ lesson, type, hasVoice }), index: 2 };
    if (!mission.cards.length) return false;
    return !!nextStep(composerArgs(mission, { srs, learn, today, rng: () => 0, now: new Date() }))?.record;
}

// A training run: a card other than the previous one, at the level he passed (or the start), never recorded.
function trainingStep(mission, { learn, rng }) {
    const prev = mission.history.at(-1)?.cardId;
    const pool = mission.cards.filter(c => c.id !== prev);
    const from = pool.length ? pool : mission.cards;
    const card = from[Math.floor(rng() * from.length)];
    if (!isLearn(card)) return { card, level: null, format: null, record: false, isNew: false };
    const state = learn.cards[card.id] ?? initial(card.kind, LESSON_LADDER);
    const top = topLevel(card.kind, mission.hasVoice, LESSON_LADDER);
    const level = state.passed > 0 ? Math.min(state.passed, top) : startLevel(card.kind, LESSON_LADDER);
    const format = pickFormat(card.kind, { ...state, lvl: level, alt: false }, learn.formats, LESSON_LADDER);
    return { card, level, format, record: false, isNew: false };
}

// The next lock's step, or done when the composer has nothing left (the remaining doors open by themselves).
export function openLock(mission, { srs, learn, today, rng = Math.random, now = new Date() }) {
    if (mission.done) return mission;
    if (mission.index >= mission.total || !mission.cards.length) return { ...mission, step: null, done: true };
    const step = mission.training ? trainingStep(mission, { learn, rng }) : nextStep(composerArgs(mission, { srs, learn, today, rng, now }));
    return step ? { ...mission, step } : { ...mission, step: null, done: true };
}

// step → the exercise the lock panel plays.
export function exerciseFor(step, { cards, rng = Math.random, now = new Date() }) {
    const { card } = step;
    if (card.kind === 'qa') return generateQa(card, { format: step.format, rng });
    if (card.kind === 'sort') {
        return { type: 'sort', cardId: card.id, label: card.item.label, emoji: card.item.emoji ?? '', cat: card.item.cat,
            cats: card.deck.cats ?? [], consigne: card.deck.consigne ?? '' };
    }
    if (isLearn(card)) return generateLesson(card, { format: step.format, cards, rng, now });
    return generate(card, { cards, rng });
}

// One answered lock. result: 'right' | 'retry' | 'miss'.
export function answerLock(mission, { srs, learn, result, ms, typed, today }) {
    const { step } = mission;
    const cardId = step.card.id;
    const recorded = !!step.record;
    const wasMastered = isMastered(learn.cards[cardId]);
    let out = { learn, srs, learning: false };
    if (recorded) out = applyStep({ learn, srs, step, result, ms, typed, today, hasVoice: mission.hasVoice, table: LESSON_LADDER });
    const index = mission.index + 1;
    const next = {
        ...mission,
        history: [...mission.history, { cardId, recorded }],
        results: [...mission.results, { cardId, result, recorded }],
        owed: recorded ? afterAnswer({ owed: mission.owed, cardId, index: mission.index, learning: out.learning }) : mission.owed,
        alarm: recorded && result === 'miss' ? Math.min(3, mission.alarm + 1) : mission.alarm,
        newCount: mission.newCount + (step.isNew ? 1 : 0),
        index,
        done: index >= mission.total,
    };
    return { mission: next, srs: out.srs, learn: out.learn, masteredNow: recorded && !wasMastered && isMastered(out.learn.cards[cardId]) };
}

// Stars come only from recorded locks answered right the first time.
export function stars(mission) {
    const recorded = mission.results.filter(r => r.recorded);
    if (!recorded.length) return 0;
    const share = recorded.filter(r => r.result === 'right').length / recorded.length;
    return share >= 0.85 ? 3 : share >= 0.6 ? 2 : 1;
}

// What the card asks and its model answer, for the debrief.
export function cueModel(card, now = new Date()) {
    const { item } = card;
    if (card.kind === 'qa') return { cue: item.q, model: item.a };
    if (card.kind === 'sort') return { cue: item.label, model: (card.deck.cats ?? []).find(c => c.id === item.cat)?.label ?? item.cat };
    const it = resolveItem(item, now);
    return { cue: it.cue ?? it.fr ?? it.gap ?? '', model: it.en[0] };
}

export function missed(mission, cards, now = new Date()) {
    const byId = new Map(cards.map(c => [c.id, c]));
    const ids = [...new Set(mission.results.filter(r => r.recorded && r.result === 'miss').map(r => r.cardId))];
    return ids.map(id => byId.get(id)).filter(Boolean).map(c => cueModel(c, now));
}
