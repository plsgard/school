// assets/en/rules.js
// Pure English-track rules: Leitner profile, composer constraints, next card of a session, settings defaults.
import { compose } from '../core/session.js';
import { dueCards } from '../core/scheduler.js';

// Box 5 = every 3 weeks: a 6ème séquence lasts 3–4 weeks, its words must still come back after the test.
export const EN_PROFILE = { intervals: [1, 2, 4, 7, 21], onWrong: [1, 1, 1, 2, 3] };

export const EN_CONSTRAINTS = {
    items: 1,
    specialSlotSkill: null,
    specialSlots: [],
    limitedKind: null,
    maxLimited: 0,
    newPerDay: { text: 3, grammar: 3, vocab: 4 }, // per deck kind: a few poem lines, sentences and words a day
    newSlots: 1,
};

// Settings live in the shared settings object under en-only keys (storage.js merges its GS defaults first).
export const EN_DEFAULTS = { enItems: 12, precision: 'normal', tries: 3, mic: 'auto', enVoice: '' };
export const LIMITS = { enItems: [6, 20], tries: [1, 5] };
export function enSettings(settings) {
    const out = { ...EN_DEFAULTS };
    for (const k of Object.keys(EN_DEFAULTS)) if (settings?.[k] != null) out[k] = settings[k];
    for (const [k, [lo, hi]] of Object.entries(LIMITS)) out[k] = Math.min(hi, Math.max(lo, Number(out[k]) || EN_DEFAULTS[k]));
    if (!['indulgent', 'normal', 'exigeant'].includes(out.precision)) out.precision = 'normal';
    if (!['auto', 'self'].includes(out.mic)) out.mic = 'auto';
    return out;
}

// The session is built one card at a time, so a listen-pick answered right (box 2) unlocks the item's say-it card
// in the same session: day 1 already has speaking. Due reviews and new cards alternate (a review first); when both
// run out, not-yet-due reviews pad the session. Cards played this session are never picked twice.
export function nextCard({ srs, cards, played, today, rng = Math.random }) {
    const byId = new Map(cards.map(c => [c.id, c]));
    const due = dueCards(srs, today).filter(id => !played.has(id)).map(id => byId.get(id)).filter(Boolean);
    // New candidates only: every card with a state (due or not) is excluded, so compose's padding/easy rules stay out.
    const known = cards.filter(c => srs.cards[c.id]).map(c => c.id);
    // New items in deck order (a poem is learnt line by line): an rng just under 1 makes compose's shuffle the identity.
    const fresh = compose({ srs, cards, today, rng: () => 0.999999, constraints: EN_CONSTRAINTS, exclude: [...played, ...known] }).slots[0] ?? null;
    const reviewTurn = played.size % 2 === 0;
    if (due.length && (reviewTurn || !fresh)) return due[0];
    if (fresh) return fresh;
    return compose({ srs, cards, today, rng, constraints: EN_CONSTRAINTS, exclude: [...played] }).slots[0] ?? null;
}

export function localDay(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Consecutive local days with a completed session, ending today or yesterday.
export function streak(sessions, today) {
    const days = new Set(sessions.map(s => s.date && localDay(new Date(s.date))).filter(Boolean));
    const d = new Date(`${today}T12:00:00`);
    if (!days.has(today)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
}
