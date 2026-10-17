// assets/core/session.js
// Pure session composer. Picks due cards first, introduces new ones within a daily budget,
// then arranges them under variety constraints. Track-agnostic: constraints are injected.
import { dueCards } from './scheduler.js';

export const GS_CONSTRAINTS = {
    items: 6,
    traceSlots: [2, 3],
    maxNumbers: 2,
    newPerDay: { letters: 2, words: 3, numbers: 1, name: 1 },
};

const itemKey = (cardId) => cardId.split('#')[0];

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickNew({ srs, cards, today, constraints, rng }) {
    const alreadyToday = new Set(srs.introduced[today] ?? []);
    const budget = {};
    for (const [kind, n] of Object.entries(constraints.newPerDay)) budget[kind] = n;
    for (const key of alreadyToday) {
        const kind = cards.find(c => itemKey(c.id) === key)?.kind;
        if (kind && budget[kind] > 0) budget[kind]--;
    }
    const chosenItems = new Set();
    const out = [];
    // Deck order is the introduction order (decks list items in teaching order).
    for (const c of cards) {
        if (srs.cards[c.id]) continue;
        const key = itemKey(c.id);
        if (alreadyToday.has(key)) continue;
        if (!chosenItems.has(key)) {
            if ((budget[c.kind] ?? 0) <= 0) continue;
            budget[c.kind]--;
            chosenItems.add(key);
        }
        out.push(c);
    }
    return { newCards: shuffle(out, rng), introduced: [...chosenItems] };
}

function arrange(candidates, constraints, rng) {
    // candidates: ordered by priority (due low box → due → new → padding)
    const n = constraints.items;
    const traceSlot = constraints.traceSlots[Math.floor(rng() * constraints.traceSlots.length)];
    const slots = new Array(n).fill(null);
    const used = new Set();
    const trace = candidates.find(c => c.skill === 'trace');
    if (trace) { slots[traceSlot] = trace; used.add(trace.id); }
    let numbers = 0;
    for (let i = 0; i < n; i++) {
        if (slots[i]) continue;
        const prev = slots[i - 1]?.skill;
        const next = slots[i + 1]?.skill;
        const pick = candidates.find(c =>
            !used.has(c.id) && c.skill !== 'trace' && c.skill !== prev && c.skill !== next &&
            (c.kind !== 'numbers' || numbers < constraints.maxNumbers));
        if (!pick) continue;
        slots[i] = pick; used.add(pick.id);
        if (pick.kind === 'numbers') numbers++;
    }
    return slots.filter(Boolean);
}

export function compose({ srs, cards, today, rng = Math.random, constraints = GS_CONSTRAINTS }) {
    const byId = new Map(cards.map(c => [c.id, c]));
    const due = dueCards(srs, today).map(id => byId.get(id)).filter(Boolean);
    const { newCards, introduced } = pickNew({ srs, cards, today, constraints, rng });
    const padding = shuffle(
        cards.filter(c => srs.cards[c.id] && srs.cards[c.id].due > today)
            .sort((a, b) => srs.cards[b.id].box - srs.cards[a.id].box),
        rng);
    const slots = arrange([...due, ...newCards, ...padding], constraints, rng);
    const usedIntroduced = introduced.filter(key => slots.some(s => itemKey(s.id) === key));
    return { slots, introduced: usedIntroduced };
}
