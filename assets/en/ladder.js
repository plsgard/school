// assets/en/ladder.js
// Pure: the written ladder of a lesson item (kinds 'spell' and 'write'). One card per item; the level decides the
// exercise format: 1 recognise (pick), 2 complete (missing letters / tiles), 3 write (type / look-cover-write),
// 4 transfer (dictation). Right first try climbs (fast: skips a level), a first miss stays and switches format,
// a second miss in a row goes down one level. State lives beside the Leitner state (storage.js loadLearn).

export const LEARN_KINDS = ['spell', 'write'];
export const FORMATS = {
    spell: { 1: ['pick'], 2: ['fill', 'tiles'], 3: ['type', 'cover'] },
    write: { 2: ['tiles', 'fill'], 3: ['type', 'cover'], 4: ['hear'] },
};
// Under this time a right answer is a known item: it skips a level.
export const FAST_MS = { 1: 4000, 2: 9000, 3: 12000 };
// A format is preferred over the table's order only once both have this many answers.
const MIN_SAMPLES = 8;
// Formats that show the answer first: a success there proves nothing about writing from memory. They only come
// after a miss, never first, and never count as climbing, as known or as mastered.
export const SUPPORT_FORMATS = ['cover'];

export const startLevel = (kind) => (kind === 'write' ? 2 : 1);
// Dictation needs an English voice on the device.
export const topLevel = (kind, hasVoice) => (kind === 'write' ? (hasVoice ? 4 : 3) : 3);
export const initial = (kind) => ({ lvl: startLevel(kind), miss: 0, alt: false, passed: 0, fmt: null, last: null, topDays: [] });
// The stored level, kept inside [start, top] (the top moves when a voice appears or disappears).
export const levelOf = (state, kind, top) => Math.min(top, Math.max(startLevel(kind), state?.lvl ?? startLevel(kind)));
export const isMastered = (state) => (state?.topDays?.length ?? 0) >= 2;
// Known = written from memory at least once.
export const isKnown = (state) => (state?.topDays?.length ?? 0) >= 1;

export function pickFormat(kind, state, formatStats = {}) {
    const formats = FORMATS[kind][state.lvl] ?? FORMATS[kind][startLevel(kind)];
    if (formats.length === 1) return formats[0] === 'pick' && state.alt ? 'pick2' : formats[0];
    const [a, b] = formats;
    const sa = formatStats[a], sb = formatStats[b];
    const enough = (sa?.n ?? 0) >= MIN_SAMPLES && (sb?.n ?? 0) >= MIN_SAMPLES;
    const first = enough && !SUPPORT_FORMATS.includes(b) && sb.ok / sb.n > sa.ok / sa.n ? b : a;
    return state.alt ? (first === a ? b : a) : first;
}

// result: 'right' (first try) | 'retry' (a near miss, right on the second try) | 'miss'.
export function applyAnswer(learn, cardId, kind, { result, ms, format, typed, today, top }) {
    const prev = learn.cards[cardId] ?? initial(kind);
    const lvl = levelOf(prev, kind, top);
    const next = { ...prev, lvl, fmt: format, topDays: [...(prev.topDays ?? [])] };
    const formats = { ...learn.formats };
    if (prev.fmt) {
        const s = formats[prev.fmt] ?? { n: 0, ok: 0 };
        formats[prev.fmt] = { n: s.n + 1, ok: s.ok + (result === 'right' ? 1 : 0) };
    }
    if (result === 'right' && SUPPORT_FORMATS.includes(format)) {
        // Right after seeing the answer: back to the plain format next time; the pending miss still stands, so a
        // second miss there goes down a level.
        next.alt = false;
    } else if (result === 'right') {
        next.passed = Math.max(prev.passed ?? 0, lvl);
        next.miss = 0;
        next.alt = false;
        if (lvl >= top) { if (!next.topDays.includes(today)) next.topDays.push(today); }
        else next.lvl = Math.min(top, lvl + (ms < (FAST_MS[lvl] ?? 0) ? 2 : 1));
    } else if (result === 'retry') {
        next.last = typed || prev.last || null;
    } else if (result === 'miss') {
        next.last = typed || prev.last || null;
        if (lvl >= top && next.topDays.length > 0) { next.lvl = Math.max(startLevel(kind), top - 1); next.miss = 0; next.alt = false; }
        else if (!prev.miss) { next.miss = 1; next.alt = true; }
        else { next.lvl = Math.max(startLevel(kind), lvl - 1); next.miss = 0; next.alt = false; }
    }
    return { ...learn, cards: { ...learn.cards, [cardId]: next }, formats };
}
