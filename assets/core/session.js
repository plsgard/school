// assets/core/session.js
// Pure session composer. Picks due cards first (keeping slots for new cards), introduces new ones within a daily budget,
// then arranges them under variety constraints. Track-agnostic: constraints are injected.
import { dueCards } from './scheduler.js';

// specialSlotSkill: the one skill that may only sit at one of specialSlots (GS: tracing, mid-session);
// limitedKind: the card kind capped at maxLimited per session (GS: numbers).
export const GS_CONSTRAINTS = {
    items: 6,
    specialSlotSkill: 'trace',
    specialSlots: [2, 3],
    limitedKind: 'numbers',
    maxLimited: 2,
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
    // P1: while no card of the special-slot skill (trace) is known, co-introduce it with the first fresh item that has
    // one, so the very first sessions already have their special slot (staging alone would wait for box 2).
    const sp = constraints.specialSlotSkill;
    if (sp && !cards.some(c => c.skill === sp && srs.cards[c.id]) && !unlocked.some(c => c.skill === sp)) {
        const extra = fresh.map(f => groups.get(itemKey(f.id)).find(c => c.skill === sp)).find(Boolean);
        if (extra) unlocked.push(extra);
    }
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
const MAX_PER_SKILL = 2;

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

function arrange(candidates, constraints, rng, boxOf, reserve = 0) {
    // candidates: ordered by priority (due low box → due → new → padding).
    // Fills left to right and stops at the first slot it cannot fill: never compacts across a gap,
    // so the trace stays at an allowed index and no two neighbours share a skill.
    const n = constraints.items;
    const special = constraints.specialSlotSkill;
    const allowed = constraints.specialSlots ?? [];
    const limitedKind = constraints.limitedKind;
    const preferred = allowed[Math.floor(rng() * allowed.length)];
    const slots = [];
    const used = new Set();
    let limited = 0;
    let placedSpecial = false;
    let preferredMissed = false;
    const perSkill = new Map();
    const fits = (c, i) => !used.has(c.id) && c.skill !== slots[i - 1]?.skill &&
        (c.kind !== limitedKind || limited < constraints.maxLimited);
    // P2 (soft): at most MAX_PER_SKILL cards of one skill per session while another fitting candidate exists.
    // The reserved new slots stay stronger: a new card is not traded for variety while fewer than `reserve` are placed.
    const isNew = (c) => boxOf(c) === 0;
    let newPlaced = 0;
    const find = (pred, i) => {
        const any = candidates.find(c => pred(c) && fits(c, i)) ?? null;
        const varied = candidates.find(c => pred(c) && fits(c, i) && (perSkill.get(c.skill) ?? 0) < MAX_PER_SKILL) ?? null;
        if (any && isNew(any) && varied && !isNew(varied) && newPlaced < reserve) return any;
        return varied ?? any;
    };
    for (let i = 0; i < n; i++) {
        let pick = null;
        // The special skill goes at the preferred slot; the other allowed slot is a fallback only when it comes later.
        if (!placedSpecial && allowed.includes(i) && (i === preferred || preferredMissed)) {
            pick = find(c => c.skill === special, i);
            if (!pick && i === preferred) preferredMissed = true;
        }
        // Spec §10.3: one easy card (box >= 3) in slot 0 or 1 when one is available.
        if (!pick && i < 2 && !slots.some(s => boxOf(s) >= EASY_BOX)) {
            pick = find(c => c.skill !== special && boxOf(c) >= EASY_BOX, i);
        }
        pick ??= find(c => c.skill !== special, i);
        if (!pick) break;
        slots.push(pick); used.add(pick.id);
        perSkill.set(pick.skill, (perSkill.get(pick.skill) ?? 0) + 1);
        if (isNew(pick)) newPlaced++;
        if (pick.skill === special) placedSpecial = true;
        if (pick.kind === limitedKind) limited++;
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
    const slots = arrange([...due.slice(0, keep), ...newCards, ...due.slice(keep), ...padding], constraints, rng, boxOf, reserve);
    const usedIntroduced = introduced.filter(key => slots.some(s => itemKey(s.id) === key));
    return { slots, introduced: usedIntroduced };
}

// Themed practice rounds (as many as the child wants). Track-agnostic: the theme is the injected `include(card)`.
// `cards` must be ALL cards: new-card eligibility (staging, unlocks, the per-kind daily budget, introduced[today])
// is the daily session's, computed on the full set — a themed subset would see a half-known item as fresh.
export const GS_PRACTICE = {
    items: 6,
    maxNew: 1,      // at most one new card per round, inside the shared daily budget
    maxRepeat: 2,   // a known card appears at most twice in a round, never in adjacent slots
    weakBox: 2,     // a not-due card is weak when box <= weakBox or lapses >= weakLapses
    weakLapses: 2,
    newPerDay: GS_CONSTRAINTS.newPerDay,
    specialSlotSkill: GS_CONSTRAINTS.specialSlotSkill, // pickNew's trace co-introduction, as in the daily session
};

// Greedy order: an easy card first (never a new one when anything else exists), then never the same card twice in a
// row and, when possible, not the same skill. Stops if only copies of the previous card are left.
function orderRound(list, boxOf, isNew) {
    const left = list.slice();
    const out = [];
    while (left.length) {
        const prev = out[out.length - 1];
        let i;
        if (!prev) {
            i = left.findIndex(c => boxOf(c) >= EASY_BOX);
            if (i < 0) i = left.findIndex(c => !isNew(c));
            if (i < 0) i = 0;
        } else {
            i = left.findIndex(c => c.id !== prev.id && c.skill !== prev.skill);
            if (i < 0) i = left.findIndex(c => c.id !== prev.id);
        }
        if (i < 0) break;
        out.push(left.splice(i, 1)[0]);
    }
    return out;
}

export function composePractice({ srs, cards, today, include = () => true, rng = Math.random, constraints = GS_PRACTICE, recent = [] }) {
    const n = constraints.items;
    const themed = cards.filter(include);
    if (!themed.length || n <= 0) return { slots: [], preview: [] };
    const st = (c) => srs.cards[c.id];
    const known = themed.filter(st);
    const due = known.filter(c => st(c).due <= today)
        .sort((a, b) => st(a).box - st(b).box || st(a).due.localeCompare(st(b).due));
    const notDue = known.filter(c => st(c).due > today);
    const isWeak = (c) => st(c).box <= constraints.weakBox || (st(c).lapses ?? 0) >= constraints.weakLapses;
    const weak = notDue.filter(isWeak).sort((a, b) => st(a).box - st(b).box
        || (st(b).lapses ?? 0) - (st(a).lapses ?? 0) || st(a).due.localeCompare(st(b).due));
    const head = shuffle(weak.slice(0, 2 * n), rng); // the weakest, varied between rounds
    const rest = shuffle([...weak.slice(2 * n), ...notDue.filter(c => !isWeak(c))], rng);
    const last = new Set(recent); // the previous round of this theme: played again only when nothing else is left
    const ordered = [...due, ...head, ...rest];
    const knownOrder = [...ordered.filter(c => !last.has(c.id)), ...ordered.filter(c => last.has(c.id))];

    const { newCards } = pickNew({ srs, cards, today, constraints, rng });
    const fresh = newCards.filter(include).slice(0, constraints.maxNew ?? 1);
    const base = knownOrder.slice(0, Math.max(n - fresh.length, 0));
    const picked = [...base.slice(0, 1), ...fresh, ...base.slice(1)]; // the new card early, never first
    for (let r = 1; r < (constraints.maxRepeat ?? 1) && picked.length < n; r++) {
        for (const c of knownOrder) { if (picked.length >= n) break; picked.push(c); }
    }
    // Still short (a theme she has barely met): preview cards, played for exposure and never recorded, so the
    // schedule and the daily budget are untouched. Items she already knows first, then deck order; one per item.
    const preview = [];
    if (picked.length < n) {
        const knownItems = new Set(Object.keys(srs.cards).map(itemKey));
        const taken = new Set(fresh.map(c => itemKey(c.id)));
        const unknown = themed.filter(c => !st(c) && !fresh.includes(c));
        for (const c of [...unknown.filter(c => knownItems.has(itemKey(c.id))), ...unknown.filter(c => !knownItems.has(itemKey(c.id)))]) {
            if (picked.length >= n) break;
            if (taken.has(itemKey(c.id))) continue;
            taken.add(itemKey(c.id));
            picked.push(c);
            preview.push(c.id);
        }
    }
    return { slots: orderRound(picked, (c) => st(c)?.box ?? 0, (c) => !st(c)), preview };
}
