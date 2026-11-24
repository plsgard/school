// assets/agent/rules.js
// Pure: Agent L's game rules: credits, experience and ranks, the shop, priority missions, the daily cap, chips, the
// game's own day log and streak, and the save's normalisation. Learning never lives here (learn / srs belong to the
// lesson engine); this file only pays for it. Stars come from first-try answers only; stealth earns a small bonus.
export const GAME_ID = 'agent';

export const PAY = { right: 5, retry: 2, miss: 0, token: 1, mastered: 15, star: 10, stealth: 5, chip: 2 };

export const RANK_XP = [0, 60, 150, 280, 450, 660, 920, 1230, 1600, 2050];
export const RANKS = [
    { id: 'recrue', name: 'Recrue' },
    { id: 'cadet', name: 'Cadet' },
    { id: 'agent', name: 'Agent' },
    { id: 'eclaireur', name: 'Éclaireur' },
    { id: 'infiltre', name: 'Infiltré' },
    { id: 'specialiste', name: 'Spécialiste' },
    { id: 'agent-special', name: 'Agent spécial' },
    { id: 'expert', name: 'Expert' },
    { id: 'maitre-espion', name: 'Maître espion' },
    { id: 'legende', name: 'Légende' },
];

// colors: the agent's suit, trim and visor (scene.js); gadgets and the board have none.
export const CATALOG = [
    { id: 'classic', kind: 'outfit', name: 'Tenue classique', rank: 0, cost: 0, colors: [0x2b3a55, 0xf2b134, 0x7fd1ff] },
    { id: 'emp', kind: 'gadget', name: 'IEM (gèle un robot 5 s)', rank: 1, cost: 80 },
    { id: 'night', kind: 'outfit', name: 'Tenue de nuit', rank: 1, cost: 60, colors: [0x1b1d2a, 0x5a5f7a, 0x6effa8] },
    { id: 'hint', kind: 'gadget', name: 'Drone indice', rank: 2, cost: 120 },
    { id: 'desert', kind: 'outfit', name: 'Tenue désert', rank: 2, cost: 100, colors: [0xc89b5d, 0x7a5230, 0xffe08a] },
    { id: 'jungle', kind: 'outfit', name: 'Tenue jungle', rank: 3, cost: 150, colors: [0x3d6b35, 0x9bc53d, 0xf5f06e] },
    { id: 'board', kind: 'board', name: 'Hoverboard', rank: 4, cost: 300 },
    { id: 'arctic', kind: 'outfit', name: 'Tenue polaire', rank: 5, cost: 220, colors: [0xe8f1f7, 0x5aa9e6, 0xff8c42] },
    { id: 'neon', kind: 'outfit', name: 'Tenue néon', rank: 6, cost: 280, colors: [0x22223b, 0xff2e93, 0x2ef2ff] },
    { id: 'gold', kind: 'outfit', name: 'Tenue dorée', rank: 8, cost: 400, colors: [0xd4a017, 0x3b2f0b, 0xfff3b0] },
];
const ITEM = Object.fromEntries(CATALOG.map(i => [i.id, i]));
export const itemById = (id) => ITEM[id] ?? null;

const DAYS_KEPT = 30;
const MAX_MISSIONS = [1, 12];
const DAY_MS = 864e5;

export { localDay } from '../en/rules.js';
export const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

const defaults = () => ({
    v: 1, credits: 0, xp: 0, owned: ['classic'], equipped: { outfit: 'classic', gadget: null }, chips: [], day: null,
    missionsToday: 0, priority: { day: null, ids: [], done: [] }, missions: {}, days: {},
    settings: { maxMissions: 6, sound: true }, seenIntro: false,
});
const count = (n) => Math.max(0, Math.floor(Number(n) || 0));
const list = (a) => (Array.isArray(a) ? a.filter(x => typeof x === 'string') : []);

// Any stored value (or null) → a valid state. lessonIds / chipIds: the ids that exist now (others are dropped);
// omitted, nothing is filtered.
export function normalize(raw, { lessonIds, chipIds } = {}) {
    const base = defaults();
    const r = raw && typeof raw === 'object' ? raw : {};
    const lessonOk = (id) => !lessonIds || lessonIds.includes(id);
    const owned = [...new Set(['classic', ...list(r.owned)])].filter(id => ITEM[id]);
    const eq = r.equipped ?? {};
    const rs = r.settings ?? {};
    const max = rs.maxMissions == null || rs.maxMissions === '' ? NaN : Math.round(Number(rs.maxMissions));
    const settings = {
        maxMissions: Number.isFinite(max) ? Math.min(MAX_MISSIONS[1], Math.max(MAX_MISSIONS[0], max)) : base.settings.maxMissions,
        sound: rs.sound !== false,
    };
    const pr = r.priority ?? {};
    const days = Object.entries(r.days && typeof r.days === 'object' ? r.days : {})
        .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-DAYS_KEPT)
        .map(([d, v]) => [d, { missions: count(v?.missions), locks: count(v?.locks), firstTry: count(v?.firstTry) }]);
    const missions = Object.entries(r.missions && typeof r.missions === 'object' ? r.missions : {}).filter(([id]) => lessonOk(id))
        .map(([id, m]) => [id, { runs: count(m?.runs), bestStars: Math.min(3, count(m?.bestStars)),
            lastType: typeof m?.lastType === 'string' ? m.lastType : null, last: typeof m?.last === 'string' ? m.last : null }]);
    return {
        ...base,
        credits: count(r.credits),
        xp: count(r.xp),
        owned,
        equipped: {
            outfit: owned.includes(eq.outfit) && ITEM[eq.outfit].kind === 'outfit' ? eq.outfit : 'classic',
            gadget: owned.includes(eq.gadget) && ITEM[eq.gadget].kind === 'gadget' ? eq.gadget : null,
        },
        chips: [...new Set(list(r.chips))].filter(id => !chipIds || chipIds.includes(id)),
        day: typeof r.day === 'string' ? r.day : null,
        missionsToday: count(r.missionsToday),
        priority: { day: typeof pr.day === 'string' ? pr.day : null, ids: list(pr.ids).filter(lessonOk), done: list(pr.done).filter(lessonOk) },
        missions: Object.fromEntries(missions),
        days: Object.fromEntries(days),
        settings,
        seenIntro: r.seenIntro === true,
    };
}

// The day rolls over between missions only (the page calls this before a mission starts and on the hub).
export function rollDay(state, today) {
    if (state.day === today) return state;
    return { ...state, day: today, missionsToday: 0, priority: { day: null, ids: [], done: [] } };
}

export const canStart = (state) => state.missionsToday < state.settings.maxMissions;

const dayOf = (state, today) => state.days[today] ?? { missions: 0, locks: 0, firstTry: 0 };
const keepDays = (days) => Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-DAYS_KEPT));

// A mission counts for the cap (and the day log) when it starts: quitting early gives no free mission.
export function beginMission(state, { lessonId, type, today }) {
    const s = rollDay(state, today);
    const m = s.missions[lessonId] ?? { runs: 0, bestStars: 0, lastType: null, last: null };
    const d = dayOf(s, today);
    return {
        ...s,
        missionsToday: s.missionsToday + 1,
        missions: { ...s.missions, [lessonId]: { ...m, runs: m.runs + 1, lastType: type, last: today } },
        days: keepDays({ ...s.days, [today]: { ...d, missions: d.missions + 1 } }),
    };
}

const addLocks = (state, today, locks, firstTry) => {
    const d = dayOf(state, today);
    return keepDays({ ...state.days, [today]: { ...d, locks: d.locks + locks, firstTry: d.firstTry + firstTry } });
};

// 🏠 mid-mission: the answers already given stay recorded and paid lock by lock, no star pay.
export function quitMission(state, { today, locks, firstTry }) {
    return { ...state, days: addLocks(state, today, locks, firstTry) };
}

// One answered lock. An unrecorded lock (a replay of an item passed) pays a token when right, in credits only: the
// rank rises only with real retrieval. A revealed answer pays nothing.
export function payLock(state, { result, recorded, masteredNow }) {
    const credits = !recorded ? (result === 'right' ? PAY.token : 0) : (PAY[result] ?? 0) + (masteredNow ? PAY.mastered : 0);
    const xp = recorded ? credits : 0;
    return { state: { ...state, credits: state.credits + credits, xp: state.xp + xp }, credits, xp };
}

export function rankOf(xp) {
    let r = 0;
    for (let i = 0; i < RANK_XP.length; i++) if (xp >= RANK_XP[i]) r = i;
    return r;
}

// The end of a mission. runCredits / runXp: what its locks already paid (payLock), runXp without the tokens. The
// stealth bonus never changes the stars. A priority lesson's first finished recorded run of the day pays its run and
// its stars once more: the tokens doubled as credits only. A training run never counts as the priority run.
export function finishMission(state, { lessonId, stars, runCredits, runXp = 0, training = false, today, locks, firstTry, caught }) {
    const starPay = stars * PAY.star;
    const stealth = caught === 0 && stars > 0 ? PAY.stealth : 0;
    const priority = !training && state.priority.ids.includes(lessonId) && !state.priority.done.includes(lessonId);
    const credits = starPay + stealth + (priority ? runCredits + starPay : 0);
    const m = state.missions[lessonId] ?? { runs: 1, bestStars: 0, lastType: null, last: today };
    const xp = state.xp + starPay + stealth + (priority ? runXp + starPay : 0);
    const next = {
        ...state,
        credits: state.credits + credits,
        xp,
        priority: priority ? { ...state.priority, done: [...state.priority.done, lessonId] } : state.priority,
        missions: { ...state.missions, [lessonId]: { ...m, bestStars: Math.max(m.bestStars, stars) } },
        days: addLocks(state, today, locks, firstTry),
    };
    return { state: next, credits, rankUp: rankOf(xp) > rankOf(Math.max(0, state.xp - runXp)) };
}

// lessons: [{ id, exam, need, recordable }]. Only a lesson with a recorded run possible today (recordable: the
// beacon's mission-or-training test) can be a priority. At most 3, maybe none: a test within 7 days first (soonest
// first), then the most to work on.
export function pickPriority(lessons, today) {
    const t = dayNumber(today);
    const until = (l) => (l.exam ? dayNumber(l.exam) - t : Infinity);
    const open = lessons.filter(l => l.recordable);
    const soon = open.filter(l => until(l) >= 0 && until(l) <= 7).sort((a, b) => until(a) - until(b));
    const others = open.filter(l => !soon.includes(l)).sort((a, b) => b.need - a.need);
    return [...soon, ...others].slice(0, 3).map(l => l.id);
}

export function buy(state, id) {
    const item = ITEM[id];
    if (!item || state.owned.includes(id) || rankOf(state.xp) < item.rank || state.credits < item.cost) return state;
    return { ...state, credits: state.credits - item.cost, owned: [...state.owned, id] };
}

// An outfit replaces the current one; a gadget is equipped or, tapped again, put away. The board works once owned.
export function equip(state, id) {
    const item = ITEM[id];
    if (!item || !state.owned.includes(id)) return state;
    if (item.kind === 'outfit') return { ...state, equipped: { ...state.equipped, outfit: id } };
    if (item.kind === 'gadget') return { ...state, equipped: { ...state.equipped, gadget: state.equipped.gadget === id ? null : id } };
    return state;
}

// A data chip on a rooftop: credits once, never experience (rank reflects learning).
export function collectChip(state, id) {
    if (state.chips.includes(id)) return { state, credits: 0 };
    return { state: { ...state, chips: [...state.chips, id], credits: state.credits + PAY.chip }, credits: PAY.chip };
}

// Consecutive days with a mission, ending today or yesterday.
export function streak(days, today) {
    const played = new Set(Object.entries(days ?? {}).filter(([, d]) => d?.missions > 0).map(([d]) => dayNumber(d)));
    let n = dayNumber(today);
    if (!played.has(n)) n -= 1;
    let s = 0;
    while (played.has(n)) { s++; n--; }
    return s;
}

// A full or blocked storage must never stop the game.
export function persist(save, state) {
    try { save(state); return true; } catch { return false; }
}
