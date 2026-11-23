// assets/jeu/rules.js
// Pure rules of « L’île des Gribouilles »: biomes, the per-skill ladder, expeditions, crystals, the village catalog.
//
// Ladder, per skill (state.skills[id] = { lvl, streak, misses, top, best, n, ok, slips }): FAST first-try answers in
// a row master a level he has never missed at, MASTERY once he has (`slips` lists those levels) and always in a
// `steady` land; mastering moves up, and at the last level the skill is `top`. PULLBACK first-try misses in a row
// move down one level: the questions get easier again, but `best` (the stars) never goes down, so a child never loses
// a star, a friend or something to build. Only the first throw at a question counts; a replayed miss never does.
// Placement: the very first question of a skill (outside a steady land) is asked at level PROBE; right on the first
// throw, the skill starts there (the levels below count as passed); wrong, nothing is held against him.
import { SKILLS, skillById } from './questions.js';

export const MASTERY = 4;
export const FAST = 2;
export const PROBE = 2;
export const PULLBACK = 2;
export const RUN_QUESTIONS = 8;
export const FRIEND_STARS = 3;

export const BIOMES = [
    { id: 'foret', name: 'Forêt des Nombres', emoji: '🌲', creature: '👾', prop: '🌲', friend: '🦉', ground: ['#8fce7a', '#84c470'], skills: ['num.compare', 'num.decompose', 'num.suite'] },
    { id: 'mine', name: 'Mine du Calcul', emoji: '⛏️', creature: '🦇', prop: '⛰️', friend: '🦔', ground: ['#b9a58c', '#ae9a82'], skills: ['calc.add', 'calc.sub', 'calc.tables', 'calc.double'] },
    { id: 'plage', name: 'Plage des Mesures', emoji: '🏖️', creature: '🐙', prop: '🌴', friend: '🦀', ground: ['#f3dfa2', '#ecd692'], skills: ['mes.heure', 'mes.monnaie', 'mes.unites', 'geo.formes'] },
    { id: 'volcan', name: 'Volcan des Verbes', emoji: '🌋', creature: '👹', prop: '🌋', friend: '🦎', ground: ['#d99a7c', '#cf8f72'], steady: true, skills: ['conj.present', 'conj.futur', 'conj.imparfait', 'conj.temps'] },
    { id: 'marais', name: 'Marais des Mots', emoji: '🍄', creature: '👻', prop: '🍄', friend: '🐢', ground: ['#9fc9a8', '#93bf9d'], skills: ['gram.nature', 'gram.sujet', 'lex.contraire', 'lex.synonyme', 'lex.famille', 'lex.alpha'] },
    { id: 'grotte', name: 'Grotte de l’Orthographe', emoji: '❄️', creature: '🤖', prop: '❄️', friend: '🐧', ground: ['#b7d3ea', '#abc9e2'], skills: ['orth.homophones', 'orth.pluriel', 'orth.accord'] },
    { id: 'port', name: 'Port de l’Anglais', emoji: '⚓\uFE0F', creature: '🦈', prop: '⛵', friend: '🐬', ground: ['#a6d9cf', '#99cfc4'], skills: ['en.couleurs', 'en.nombres', 'en.animaux', 'en.mots', 'en.jours', 'en.phrases'] },
];
export const biomeById = (id) => BIOMES.find(b => b.id === id);
const biomeOfSkill = (id) => BIOMES.find(b => b.skills.includes(id));

// ---- Village ----
export const COLS = 18;
export const ROWS = 12;
export const SPAWN = { x: 9, y: 6 };
// `since`: the save version that added the gate (normalize clears a way to it in an older village).
export const PORTALS = [
    { biome: 'foret', x: 3, y: 0 }, { biome: 'mine', x: 9, y: 0 }, { biome: 'plage', x: 14, y: 0 },
    { biome: 'volcan', x: 3, y: 11 }, { biome: 'marais', x: 9, y: 11 }, { biome: 'grotte', x: 14, y: 11 },
    { biome: 'port', x: COLS - 1, y: 6, since: 2 },
];
// The tile in front of a gate, toward the inside of the island.
export const gateFront = (p) => ({
    x: p.x === 0 ? 1 : p.x === COLS - 1 ? COLS - 2 : p.x,
    y: p.y === 0 ? 1 : p.y === ROWS - 1 ? ROWS - 2 : p.y,
});

// `ground` items are a tile colour (no emoji: the tray shows a swatch), walked on except water; the others block the way. `stars` = total stars needed to buy.
export const CATALOG = [
    { id: 'path', name: 'Chemin', cost: 1, stars: 0, ground: '#d9c39a' },
    { id: 'tulip', emoji: '🌷', name: 'Tulipe', cost: 3, stars: 0 },
    { id: 'tree', emoji: '🌳', name: 'Arbre', cost: 5, stars: 0 },
    { id: 'pine', emoji: '🌲', name: 'Sapin', cost: 5, stars: 0 },
    { id: 'sunflower', emoji: '🌻', name: 'Tournesol', cost: 4, stars: 1 },
    { id: 'tent', emoji: '⛺', name: 'Tente', cost: 15, stars: 1 },
    { id: 'water', name: 'Eau', cost: 2, stars: 2, ground: '#6ec3e8', solid: true },
    { id: 'mushroom', emoji: '🍄', name: 'Champignon', cost: 4, stars: 2 },
    { id: 'house', emoji: '🏠', name: 'Maison', cost: 40, stars: 3 },
    { id: 'lantern', emoji: '🏮', name: 'Lanterne', cost: 8, stars: 4 },
    { id: 'sand', name: 'Sable', cost: 1, stars: 5, ground: '#f0dc9a' },
    { id: 'palm', emoji: '🌴', name: 'Palmier', cost: 8, stars: 5 },
    { id: 'fountain', emoji: '⛲', name: 'Fontaine', cost: 60, stars: 7 },
    { id: 'garden', emoji: '🏡', name: 'Maison fleurie', cost: 70, stars: 9 },
    { id: 'flag', emoji: '🚩', name: 'Drapeau', cost: 10, stars: 11 },
    { id: 'cactus', emoji: '🌵', name: 'Cactus', cost: 8, stars: 13 },
    { id: 'statue', emoji: '🗿', name: 'Statue', cost: 80, stars: 16 },
    { id: 'circus', emoji: '🎪', name: 'Chapiteau', cost: 120, stars: 20 },
    { id: 'carousel', emoji: '🎠', name: 'Manège', cost: 150, stars: 25 },
    { id: 'castle', emoji: '🏰', name: 'Château', cost: 250, stars: 32 },
    { id: 'wheel', emoji: '🎡', name: 'Grande roue', cost: 300, stars: 40 },
    { id: 'rocket', emoji: '🚀', name: 'Fusée', cost: 500, stars: 55 },
];
export const itemById = (id) => CATALOG.find(i => i.id === id);

export const HEROES = [
    { id: 'cat', emoji: '🐱', cost: 0 }, { id: 'dog', emoji: '🐶', cost: 30 }, { id: 'fox', emoji: '🦊', cost: 60 },
    { id: 'panda', emoji: '🐼', cost: 90 }, { id: 'rabbit', emoji: '🐰', cost: 90 }, { id: 'lion', emoji: '🦁', cost: 150 },
    { id: 'dragon', emoji: '🐲', cost: 220 }, { id: 'robot', emoji: '🤖', cost: 300 }, { id: 'unicorn', emoji: '🦄', cost: 400 },
    { id: 'wizard', emoji: '🧙', cost: 600 },
];
export const heroById = (id) => HEROES.find(h => h.id === id) ?? HEROES[0];

// ---- State ----
export const MAX_RUNS_CHOICES = [3, 4, 6, 8, 10, 0]; // 0 = no limit
export const VERSION = 2;
export const defaultState = () => ({
    v: VERSION, crystals: 0, hero: 'cat', heroes: ['cat'], skills: {}, village: {}, day: '', runsToday: 0, runs: 0,
    lastPlayed: {}, bonusDay: '', bonusBiome: '', settings: { maxRuns: 6, sound: true }, seenIntro: false,
});

// Stored state → usable state: unknown items, heroes and skills are dropped so a renamed id never breaks the game.
// A building on a tile that is no longer buildable (a gate was added) is refunded, never dropped silently; in a save
// older than a gate, a gate the hero cannot reach is given a way: the blocking buildings on the straight line from
// the spawn to the tile in front of it (along the spawn's column, then the gate's row) are refunded too.
export function normalize(raw) {
    const base = defaultState();
    const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
    s.settings = { ...base.settings, ...s.settings };
    if (!MAX_RUNS_CHOICES.includes(s.settings.maxRuns)) s.settings.maxRuns = base.settings.maxRuns;
    s.crystals = Math.max(0, Math.floor(Number(s.crystals) || 0));
    s.heroes = [...new Set(['cat', ...(Array.isArray(s.heroes) ? s.heroes : [])])].filter(id => HEROES.some(h => h.id === id));
    if (!s.heroes.includes(s.hero)) s.hero = 'cat';
    s.skills = Object.fromEntries(Object.entries(s.skills ?? {}).filter(([id]) => skillById(id)));
    const from = Number.isInteger(raw?.v) ? raw.v : 1;
    let refund = 0;
    s.village = Object.fromEntries(Object.entries(s.village ?? {}).filter(([k, id]) => {
        if (!itemById(id)) return false;
        if (buildable(...k.split(',').map(Number))) return true;
        refund += itemById(id).cost;
        return false;
    }));
    for (const p of PORTALS.filter(g => (g.since ?? 1) > from)) {
        if (reachable(s, p).has(key(p.x, p.y))) continue;
        for (const t of corridor(gateFront(p))) {
            if (isSolid(s, t.x, t.y)) { refund += itemAt(s, t.x, t.y).cost; delete s.village[key(t.x, t.y)]; }
        }
    }
    s.crystals += refund;
    s.lastPlayed = { ...s.lastPlayed };
    s.v = VERSION;
    return s;
}

// Tiles the hero can walk to from the spawn without stepping on a gate other than `to` (stepping on one opens it).
export function reachable(state, to = null) {
    const gate = (x, y) => PORTALS.some(p => p !== to && p.x === x && p.y === y);
    const seen = new Set([key(SPAWN.x, SPAWN.y)]);
    const todo = [SPAWN];
    while (todo.length) {
        const { x, y } = todo.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = { x: x + dx, y: y + dy };
            if (seen.has(key(n.x, n.y)) || isSolid(state, n.x, n.y) || gate(n.x, n.y)) continue;
            seen.add(key(n.x, n.y));
            todo.push(n);
        }
    }
    return seen;
}
function corridor(to) {
    const tiles = [];
    const step = (a, b) => (a <= b ? 1 : -1);
    for (let x = SPAWN.x; x !== to.x; x += step(SPAWN.x, to.x)) tiles.push({ x, y: to.y });
    for (let y = SPAWN.y; y !== to.y; y += step(SPAWN.y, to.y)) tiles.push({ x: SPAWN.x, y });
    tiles.push(to);
    return tiles;
}

export function localDay(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---- Ladder ----
const reached = (s) => s.lvl - 1 + (s.top ? 1 : 0);
// A save before `slips` existed: a pending miss means he missed at his current level.
export function skillState(state, id) {
    const max = skillById(id).levels;
    let s = { lvl: 1, streak: 0, misses: 0, top: false, best: 0, n: 0, ok: 0, ...state.skills[id] };
    if (!(s.lvl >= 1 && s.lvl <= max)) s = { ...s, lvl: 1, streak: 0, misses: 0, top: false };
    s.slips = Array.isArray(s.slips) ? s.slips.filter(l => Number.isInteger(l) && l >= 1 && l <= max) : (s.misses > 0 ? [s.lvl] : []);
    s.best = Math.max(Number(s.best) || 0, reached(s));
    // A level was added above a mastered skill: it moves on to the new level, its stars unchanged.
    if (s.top && s.lvl < max) s = { ...s, lvl: s.lvl + 1, top: false, streak: 0, misses: 0 };
    return s;
}

// First-try answers in a row that master the current level.
export const climbNeed = (s, id) => (biomeOfSkill(id)?.steady || s.slips.includes(s.lvl) ? MASTERY : FAST);

// The level of the next question: his level, or PROBE for the first question ever of a skill (placement).
export function askLevel(state, id) {
    const s = skillState(state, id);
    return s.n === 0 && !biomeOfSkill(id)?.steady && skillById(id).levels >= PROBE ? PROBE : s.lvl;
}

export const skillStars = (state, id) => skillState(state, id).best;
export const biomeStars = (state, biomeId) => biomeById(biomeId).skills.reduce((sum, id) => sum + skillStars(state, id), 0);
export const biomeMaxStars = (biomeId) => biomeById(biomeId).skills.reduce((sum, id) => sum + skillById(id).levels, 0);
export const totalStars = (state) => BIOMES.reduce((sum, b) => sum + biomeStars(state, b.id), 0);
export const MAX_STARS = SKILLS.reduce((sum, s) => sum + s.levels, 0);

// First throw at a question of that `level` (default: his level). Returns the new state and whether a star was just
// won (a first time only). A question above his level is a placement: right moves him there, wrong counts nothing.
export function recordAnswer(state, skillId, clean, level) {
    const s = skillState(state, skillId);
    const max = skillById(skillId).levels;
    s.n++;
    if (level > s.lvl && !s.top) {
        if (clean) Object.assign(s, { ok: s.ok + 1, lvl: Math.min(level, max), streak: 1, misses: 0 });
    } else if (clean) {
        s.ok++;
        s.misses = 0;
        if (++s.streak >= climbNeed(s, skillId) && !s.top) {
            s.streak = 0;
            if (s.lvl < max) s.lvl++; else s.top = true;
        }
    } else {
        s.streak = 0;
        if (!s.slips.includes(s.lvl)) s.slips = [...s.slips, s.lvl];
        if (++s.misses >= PULLBACK) {
            s.misses = 0;
            if (s.top) s.top = false; else if (s.lvl > 1) s.lvl--;
        }
    }
    const star = reached(s) > s.best;
    if (star) s.best = reached(s);
    return { state: { ...state, skills: { ...state.skills, [skillId]: s } }, star };
}

// ---- Expeditions ----
// The plan of an expedition: RUN_QUESTIONS skills of the biome, the weakest ones more often and never the same one
// twice in a row when the biome has several; from the third question on, up to two reviews of skills of other
// biomes that already have a star (interleaving).
export function composeExpedition({ state, biomeId, rng, n = RUN_QUESTIONS }) {
    const own = biomeById(biomeId).skills;
    const weight = (id) => 1 + skillById(id).levels - skillStars(state, id);
    const plan = [];
    let last = null;
    for (let i = 0; i < n; i++) {
        const pool = own.length > 1 ? own.filter(id => id !== last) : own;
        let roll = rng() * pool.reduce((sum, id) => sum + weight(id), 0);
        last = pool.find(id => (roll -= weight(id)) < 0) ?? pool[pool.length - 1];
        plan.push({ skill: last, review: false });
    }
    const others = SKILLS.map(s => s.id).filter(id => !own.includes(id) && skillStars(state, id) > 0);
    for (const at of [3, 6]) {
        if (!others.length || at >= n) break;
        const [skill] = others.splice(Math.floor(rng() * others.length), 1);
        plan[at] = { skill, review: true };
    }
    return plan;
}

// The bonus gate: the biome with the fewest stars (relative to its size), then the one played longest ago. It is
// chosen once a day (withDailyBonus) and pays double for its first finished expedition of that day.
export function bonusBiome(state) {
    const score = (b) => biomeStars(state, b.id) / biomeMaxStars(b.id);
    return [...BIOMES].sort((a, b) => score(a) - score(b) || (state.lastPlayed[a.id] ?? '').localeCompare(state.lastPlayed[b.id] ?? ''))[0].id;
}
export const withDailyBonus = (state, day) => (state.bonusDay === day ? state : { ...state, bonusDay: day, bonusBiome: bonusBiome(state) });
export const isBonus = (state, biomeId, day) => state.bonusDay === day && state.bonusBiome === biomeId && state.lastPlayed[biomeId] !== day;

export const runsToday = (state, day) => (state.day === day ? state.runsToday : 0);
export const canRun = (state, day) => !state.settings.maxRuns || runsToday(state, day) < state.settings.maxRuns;
// An expedition counts for the day as soon as it starts: going home early does not give a free one.
export const beginRun = (state, day) => ({ ...state, day, runsToday: runsToday(state, day) + 1, runs: state.runs + 1 });

// Crystals of one question: 3 for a first-try answer plus the combo (first tries in a row, up to +3), 1 otherwise.
export const crystalsFor = ({ clean, combo }) => (clean ? 3 + Math.min(3, Math.max(0, combo - 1)) : 1);
export const RUN_BONUS = 5;

// End of an expedition. Finished: the run bonus, doubled at the bonus gate. Left early: the crystals picked up.
export function finishRun(state, { biomeId, crystals, bonus, finished = true }, day) {
    const earned = finished ? (crystals + RUN_BONUS) * (bonus ? 2 : 1) : crystals;
    return {
        state: { ...state, crystals: state.crystals + earned, lastPlayed: finished ? { ...state.lastPlayed, [biomeId]: day } : state.lastPlayed },
        earned,
    };
}

// ---- Village ----
const key = (x, y) => `${x},${y}`;
export function buildable(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    if (x === SPAWN.x && y === SPAWN.y) return false;
    // the gate and the tile in front of it stay free, so a gate can always be reached
    return !PORTALS.some(p => (p.x === x && p.y === y) || (gateFront(p).x === x && gateFront(p).y === y));
}
export const itemAt = (state, x, y) => itemById(state.village[key(x, y)]) ?? null;
export const isSolid = (state, x, y) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
    const item = itemAt(state, x, y);
    return !!item && (!item.ground || !!item.solid);
};
export const unlocked = (state, item) => totalStars(state) >= item.stars;

// Returns the new state, or null when the tile is taken or reserved, the item locked or too expensive.
export function place(state, x, y, itemId) {
    const item = itemById(itemId);
    if (!item || !buildable(x, y) || state.village[key(x, y)] || !unlocked(state, item) || state.crystals < item.cost) return null;
    return { ...state, crystals: state.crystals - item.cost, village: { ...state.village, [key(x, y)]: itemId } };
}

// Removing gives the crystals back: a child rearranges without losing anything.
export function remove(state, x, y) {
    const item = itemAt(state, x, y);
    if (!item) return null;
    const village = { ...state.village };
    delete village[key(x, y)];
    return { ...state, crystals: state.crystals + item.cost, village };
}

export function buyHero(state, heroId) {
    const hero = HEROES.find(h => h.id === heroId);
    if (!hero) return null;
    if (state.heroes.includes(heroId)) return { ...state, hero: heroId };
    if (state.crystals < hero.cost) return null;
    return { ...state, crystals: state.crystals - hero.cost, heroes: [...state.heroes, heroId], hero: heroId };
}

// Friends freed from the gribouilles: one per biome with FRIEND_STARS stars or more.
export const friends = (state) => BIOMES.filter(b => biomeStars(state, b.id) >= FRIEND_STARS).map(b => ({ biome: b.id, emoji: b.friend }));
