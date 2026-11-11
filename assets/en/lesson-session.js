// assets/en/lesson-session.js
// Pure composer of a lesson session ("Réviser cette leçon"), one exercise at a time. It opens on two past successes
// and closes on one (replayed at the level he passed, never recorded); in between it works small batches: new items
// come in file order, an item answered comes back after a few others until it is written from memory, and every
// third slot prefers the lesson's phrases (the test looks like them). The daily session (rules.js) is not involved.
import { LEARN_KINDS, initial, topLevel, levelOf, pickFormat, isMastered, isKnown, applyAnswer } from './ladder.js';
import { resolveItem } from './today.js';
import { recordResult } from '../core/progress.js';
import { record } from '../core/scheduler.js';
import { SUPPORT_FORMATS } from './ladder.js';
import { EN_PROFILE } from './rules.js';

const DAY_MS = 864e5;
const GAP = 4;       // an answered item comes back at least this many exercises later
const MAX_PLAYS = 3; // recorded plays of one card per session

// The test is today or within a week.
export function examSoon(exam, today) {
    if (!exam) return false;
    const days = (Date.parse(`${exam}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
    return days >= 0 && days <= 7;
}

// Still on the ladder: not yet written from memory, or sent back below the top after a miss.
export const inLearning = (state, kind, top) => !isKnown(state) || levelOf(state, kind, top) < top;

// A phrase waits until each of its words that is a 'spell' item of the same lesson has been met once.
export function available(card, { cards, learn, now = new Date() }) {
    if (card.kind !== 'write') return true;
    const words = new Set(resolveItem(card.item, now).en[0].split(/[\s,.?!]+/).filter(Boolean));
    const lessonId = card.deck.lesson?.id;
    return cards.filter(c => c.kind === 'spell' && c.deck.lesson?.id === lessonId && words.has(c.item.en[0]))
        .every(c => learn.cards[c.id]);
}

// cards: the lesson's cards, in file order. history: this session's [{ cardId, recorded }]. owed: [{ cardId, notBefore }].
// newCount: new cards already started this session. Returns { card, level, format, record, isNew } or null.
export function nextStep({ cards, srs, learn, today, exam = null, hasVoice = true, history = [], owed = [], index, total,
    newCount = 0, rng = Math.random, now = new Date() }) {
    const prevId = history.at(-1)?.cardId;
    const plays = new Map();
    for (const h of history) if (h.recorded) plays.set(h.cardId, (plays.get(h.cardId) ?? 0) + 1);
    const soon = examSoon(exam, today);
    const isLearn = (c) => LEARN_KINDS.includes(c.kind);
    const top = (c) => topLevel(c.kind, hasVoice);
    const st = (c) => learn.cards[c.id];
    const lvl = (c) => levelOf(st(c), c.kind, top(c));
    const ok = (c) => c.id !== prevId && (plays.get(c.id) ?? 0) < MAX_PLAYS;
    const step = (card, { record = true, level = null, isNew = false } = {}) => {
        if (!isLearn(card)) return { card, level: null, format: null, record, isNew };
        const state = st(card) ?? initial(card.kind);
        const at = level ?? lvl(card);
        // A reward replay uses the plain format of the level he passed, not the "other format" of a pending miss.
        const format = pickFormat(card.kind, { ...state, lvl: at, alt: level == null && state.alt }, learn.formats);
        return { card, level: at, format, record, isNew };
    };
    const passed = cards.filter(c => isLearn(c) && (st(c)?.passed ?? 0) > 0);
    const reward = () => {
        const used = new Set(history.filter(h => !h.recorded).map(h => h.cardId));
        const played = new Set(history.map(h => h.cardId));
        const pool = passed.filter(c => c.id !== prevId && !used.has(c.id));
        const fresh = pool.filter(c => !played.has(c.id));
        const from = fresh.length ? fresh : pool;
        if (!from.length) return null;
        const c = from[Math.floor(rng() * from.length)];
        return step(c, { record: false, level: Math.min(st(c).passed, top(c)) });
    };

    if (index < 2 || index === total - 1) { const r = reward(); if (r) return r; }

    const byId = new Map(cards.map(c => [c.id, c]));
    const owedIds = new Set(owed.map(o => o.cardId));
    const dueOwed = owed.filter(o => o.notBefore <= index).map(o => byId.get(o.cardId)).filter(c => c && ok(c));

    // Learning: met, not yet written from memory. Lowest level first, then file order.
    const learning = cards.filter(c => isLearn(c) && st(c) && inLearning(st(c), c.kind, top(c)) && !owedIds.has(c.id) && ok(c))
        .sort((a, b) => lvl(a) - lvl(b));
    const cap = soon ? Infinity : Math.ceil(total / 2);
    const fresh = newCount < cap
        ? cards.filter(c => ok(c) && (isLearn(c) ? !st(c) && available(c, { cards, learn, now }) : !srs.cards[c.id]))
        : [];
    // Reviews: what the scheduler says is due; in the last week before the test, also what he can write but has
    // not confirmed on a second day.
    const due = (c) => (srs.cards[c.id]?.due ?? '9999') <= today;
    const confirm = (c) => soon && isLearn(c) && !isMastered(st(c)) && st(c).topDays.at(-1) !== today;
    const reviews = cards.filter(c => ok(c) && !owedIds.has(c.id) && (isLearn(c)
        ? st(c) && !inLearning(st(c), c.kind, top(c)) && (due(c) || confirm(c))
        : srs.cards[c.id] && due(c)));
    // The slot before the closing one is kept for confirming, before the test, an item written from memory on
    // another day: learning and new items would otherwise fill every slot until the test.
    if (index === total - 2) { const c = reviews.find(confirm); if (c) return step(c); }

    // Every third slot (after the opening ones) goes to a phrase when one can be played, ahead of what is owed.
    if (index > 2 && index % 3 === 2) {
        const phrase = [...dueOwed, ...learning, ...fresh].find(c => c.kind === 'write');
        if (phrase) return step(phrase, { isNew: !st(phrase) });
    }
    if (dueOwed.length) return step(dueOwed[0]);
    if (learning.length) return step(learning[0]);
    if (fresh.length) return step(fresh[0], { isNew: true });

    if (reviews.length) return step(reviews[0]);

    const early = owed.slice().sort((a, b) => a.notBefore - b.notBefore).map(o => byId.get(o.cardId)).filter(c => c && ok(c));
    if (early.length) return step(early[0]);
    return reward();
}

// After a recorded answer: an item still being learnt is owed again a few exercises later.
export function afterAnswer({ owed, cardId, index, learning }) {
    const rest = owed.filter(o => o.cardId !== cardId);
    return learning ? [...rest, { cardId, notBefore: index + GAP }] : rest;
}

// Pure: one answered step → the next stored states. `learning` says whether the card is owed again this session.
// A lesson item enters the Leitner schedule with its first right answer at the top level; from then on a top-level
// answer moves its box like any card (not before it is due: no promotion for extra practice), a miss demotes it.
export function applyStep({ learn, srs, step, result, ms, typed, today, hasVoice = true, profile = EN_PROFILE }) {
    const { card } = step;
    if (!step.record) return { learn, srs, learning: false };
    if (!LEARN_KINDS.includes(card.kind)) {
        // `record`, not `recordResult`: a lesson session must not spend the daily session's new-item budget.
        return { learn, srs: record(srs, card.id, result === 'right', today, profile), learning: false };
    }
    const top = topLevel(card.kind, hasVoice);
    const nextLearn = applyAnswer(learn, card.id, card.kind, { result, ms, format: step.format, typed, today, top });
    let nextSrs = srs;
    const known = srs.cards[card.id];
    const fromMemory = !SUPPORT_FORMATS.includes(step.format);
    if (step.level >= top && fromMemory && result === 'right' && (!known || known.due <= today)) nextSrs = recordResult(srs, card.id, true, today, profile);
    else if (result === 'miss' && known) nextSrs = recordResult(srs, card.id, false, today, profile);
    return { learn: nextLearn, srs: nextSrs, learning: inLearning(nextLearn.cards[card.id], card.kind, top) };
}
