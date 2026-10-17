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

const EASY_BOX = 3;

// Spec §10.4: pad with review cards of box >= 4, highest box first, shuffled only within an equal box.
// Lower boxes come after them in the same order, so they are used only when box >= 4 runs out.
function paddingOrder(cards, srs, today, rng) {
    const byBox = new Map();
    for (const c of cards) {
        const s = srs.cards[c.id];
        if (!s || s.due <= today) continue;
        if (!byBox.has(s.box)) byBox.set(s.box, []);
        byBox.get(s.box).push(c);
    }
    return [...byBox.keys()].sort((a, b) => b - a).flatMap(box => shuffle(byBox.get(box), rng));
}

function arrange(candidates, constraints, rng, boxOf) {
    // candidates: ordered by priority (due low box → due → new → padding).
    // Fills left to right and stops at the first slot it cannot fill: never compacts across a gap,
    // so the trace stays at an allowed index and no two neighbours share a skill.
    const n = constraints.items;
    const allowed = constraints.traceSlots;
    const preferred = allowed[Math.floor(rng() * allowed.length)];
    const slots = [];
    const used = new Set();
    let numbers = 0;
    let traced = false;
    let preferredMissed = false;
    const fits = (c, i) => !used.has(c.id) && c.skill !== slots[i - 1]?.skill &&
        (c.kind !== 'numbers' || numbers < constraints.maxNumbers);
    for (let i = 0; i < n; i++) {
        let pick = null;
        // Trace goes at the preferred slot; the other allowed slot is a fallback only when it comes later.
        if (!traced && allowed.includes(i) && (i === preferred || preferredMissed)) {
            pick = candidates.find(c => c.skill === 'trace' && fits(c, i)) ?? null;
            if (!pick && i === preferred) preferredMissed = true;
        }
        // Spec §10.3: one easy card (box >= 3) in slot 0 or 1 when one is available.
        if (!pick && i < 2 && !slots.some(s => boxOf(s) >= EASY_BOX)) {
            pick = candidates.find(c => c.skill !== 'trace' && boxOf(c) >= EASY_BOX && fits(c, i)) ?? null;
        }
        pick ??= candidates.find(c => c.skill !== 'trace' && fits(c, i)) ?? null;
        if (!pick) break;
        slots.push(pick); used.add(pick.id);
        if (pick.skill === 'trace') traced = true;
        if (pick.kind === 'numbers') numbers++;
    }
    return slots;
}

export function compose({ srs, cards, today, rng = Math.random, constraints = GS_CONSTRAINTS }) {
    const byId = new Map(cards.map(c => [c.id, c]));
    const due = dueCards(srs, today).map(id => byId.get(id)).filter(Boolean);
    const { newCards, introduced } = pickNew({ srs, cards, today, constraints, rng });
    const padding = paddingOrder(cards, srs, today, rng);
    const boxOf = (c) => srs.cards[c.id]?.box ?? 0;
    const slots = arrange([...due, ...newCards, ...padding], constraints, rng, boxOf);
    const usedIntroduced = introduced.filter(key => slots.some(s => itemKey(s.id) === key));
    return { slots, introduced: usedIntroduced };
}
