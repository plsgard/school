// assets/ce2/rules.js
// Pure rules of the CE2 subtraction track: settings, the level ladder, spaced review of mastered levels, sessions.
//
// Ladder (srs.ladder, beside the Leitner cards): MASTERY first-try successes in a row master the current level and
// move up to the next unlocked one; PULLBACK misses in a row move down one. Outcomes of a problem:
// 'clean' = right with no wrong digit, 'fixed' = right after one wrong digit (no star, streak reset, not a miss),
// 'missed' = second wrong check or the worked solution shown.
// A mastered level becomes a Leitner card (`L<n>`, core/scheduler.record) so it comes back as review now and then.
import { record, dueCards } from '../core/scheduler.js';
import { LEVELS, LOCKABLE, levelById } from './generators.js';

export const MASTERY = 4;
export const PULLBACK = 2;
export const MAX_REVIEW = 2;
export const SESSION_MS = 10 * 60e3;
// A computation skill decays more slowly than a word: longer intervals than the word tracks.
export const CE2_PROFILE = { intervals: [2, 4, 7, 14, 21], onWrong: [1, 1, 1, 2, 3] };

const clamp = (n, lo, hi, fallback) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

export function ce2Settings(s) {
    return {
        items: clamp(Number(s.ce2Items ?? 8), 6, 10, 8),
        mode: s.ce2Mode === 'solo' ? 'solo' : 'guided',
        proof: s.ce2Proof !== false,
        unlocked: Array.isArray(s.ce2Unlocked) ? s.ce2Unlocked.filter(id => LOCKABLE.includes(id)) : [],
    };
}

export const isUnlocked = (id, unlocked) => !LOCKABLE.includes(id) || unlocked.includes(id);
export const cardId = (level) => `L${level}`;
const levelOfCard = (id) => Number(id.slice(1));

const above = (level, unlocked) => LEVELS.find(l => l.id > level && isUnlocked(l.id, unlocked))?.id ?? level;
const below = (level, unlocked) => [...LEVELS].reverse().find(l => l.id < level && isUnlocked(l.id, unlocked))?.id ?? level;

// The current level never sits on a locked one (a parent may lock it again): it falls back to the closest unlocked below.
// A stored level that is no level (corrupt, or from a future ladder) restarts at 1 rather than blocking every session.
export function ladderOf(srs, unlocked) {
    const ladder = { level: 1, streak: 0, misses: 0, ...srs.ladder };
    if (!levelById(ladder.level)) return { level: 1, streak: 0, misses: 0 };
    if (!isUnlocked(ladder.level, unlocked)) return { level: below(ladder.level, unlocked), streak: 0, misses: 0 };
    return ladder;
}

// For the home and done screens: rank among the open levels (« Niveau 7 sur 7 » when 8 is open and 7 locked), and
// whether the current level is the last open one and already mastered.
export function levelStatus(srs, unlocked) {
    const { level, streak } = ladderOf(srs, unlocked);
    const open = LEVELS.filter(l => isUnlocked(l.id, unlocked)).map(l => l.id);
    return { level, rank: open.indexOf(level) + 1, of: open.length, streak, top: open[open.length - 1] === level && !!srs.cards[cardId(level)] };
}

export const setLevel = (srs, level) => ({ ...srs, ladder: { level, streak: 0, misses: 0 } });

export function recordProblem(srs, { level, outcome, review }, today, unlocked) {
    if (review) return record(srs, cardId(level), outcome === 'clean', today, CE2_PROFILE);
    let { level: current, streak, misses } = ladderOf(srs, unlocked);
    let next = srs;
    if (outcome === 'clean') {
        streak++;
        misses = 0;
        if (streak >= MASTERY) {
            next = record(next, cardId(current), true, today, CE2_PROFILE);
            current = above(current, unlocked);
            streak = 0;
        }
    } else if (outcome === 'fixed') {
        streak = 0;
    } else {
        streak = 0;
        if (++misses >= PULLBACK) { current = below(current, unlocked); misses = 0; }
    }
    return { ...next, ladder: { level: current, streak, misses } };
}

// One entry per problem: null = the current level (read from the ladder when the problem starts, so a level mastered
// mid-session moves up at once), a number = review of that mastered level. Reviews never open the session.
export function composeSession({ srs, today, items, unlocked }) {
    const current = ladderOf(srs, unlocked).level;
    const reviews = dueCards(srs, today).map(levelOfCard)
        .filter(l => l < current && isUnlocked(l, unlocked)).slice(0, MAX_REVIEW);
    const plan = Array(items).fill(null);
    reviews.forEach((l, k) => { plan[Math.max(1, Math.round(((k + 1) * items) / (reviews.length + 1)) - 1)] = l; });
    return plan;
}

export const shouldStop = ({ index, items, startedAt, now }) => index >= items || now - startedAt >= SESSION_MS;
export const stars = (outcomes) => outcomes.filter(o => o === 'clean').length;

export function localDay(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
