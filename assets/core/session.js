// assets/core/session.js
// Pure session composer. Picks due cards first (keeping slots for new cards), introduces new ones within a daily budget,
// then arranges them under variety constraints. Track-agnostic: constraints are injected.
import { dueCards } from './scheduler.js';

export const GS_CONSTRAINTS = {
    items: 6,
    traceSlots: [2, 3],
    maxNumbers: 2,
    newPerDay: { letters: 2, words: 3, numbers: 1, name: 1 },
    newSlots: 2,
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

// A brand-new item enters with its first skill only (deck skill order) and is charged to its kind's daily
// item budget. Its other skills become eligible as new cards once that first card reached box >= UNLOCK_BOX;
// those unlocked siblings never charge the item budget again (R26, staged skills).
const UNLOCK_BOX = 2;

function pickNew({ srs, cards, today, constraints, rng }) {
    const budget = { ...constraints.newPerDay };
    const groups = new Map();
    for (const c of cards) {
        const key = itemKey(c.id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }
    for (const key of srs.introduced?.[today] ?? []) {
        const kind = groups.get(key)?.[0].kind;
        if (kind && budget[kind] > 0) budget[kind]--;
    }
    const fresh = [];
    const unlocked = [];
    const introduced = [];
    // Deck order is the introduction order (decks list items in teaching order).
    for (const [key, group] of groups) {
        const [first] = group;
        if (!group.some(c => srs.cards[c.id])) {
            if ((budget[first.kind] ?? 0) <= 0) continue;
            budget[first.kind]--;
            fresh.push(first);
            introduced.push(key);
        } else if (!srs.cards[first.id]) {
            unlocked.push(first); // older progress saw a sibling first: the first skill is simply due as new
        } else if (srs.cards[first.id].box >= UNLOCK_BOX) {
            unlocked.push(...group.filter(c => !srs.cards[c.id]));
        }
    }
    // Interleave so that new items and unlocked skills of known items share the reserved new slots.
    const a = shuffle(fresh, rng);
    const b = shuffle(unlocked, rng);
    const newCards = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i < a.length) newCards.push(a[i]);
        if (i < b.length) newCards.push(b[i]);
    }
    return { newCards, introduced };
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
    // R26: keep up to NEW_SLOTS slots for new cards whenever some exist; the extra due reviews (highest boxes,
    // since due is sorted lowest box first) slip to a later day. They stay ahead of padding as a fallback.
    const reserve = Math.min(constraints.newSlots ?? 0, newCards.length);
    const keep = Math.max(constraints.items - reserve, 0);
    const slots = arrange([...due.slice(0, keep), ...newCards, ...due.slice(keep), ...padding], constraints, rng, boxOf);
    const usedIntroduced = introduced.filter(key => slots.some(s => itemKey(s.id) === key));
    return { slots, introduced: usedIntroduced };
}
