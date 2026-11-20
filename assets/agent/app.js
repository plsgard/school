// assets/agent/app.js
// Agent L (agent.html): the page. A state machine boot → hub → briefing → mission → debrief → hub, a fixed 1/60 s
// simulation step and one render per animation frame, paused while the page is hidden or a panel is open.
// Decisions come from the pure modules (rules, missions, world, levels); scene.js draws, input.js listens, ui.js /
// locks.js / sound.js speak to the child. Learning state (learn / srs) is the lesson engine's, shared with en.html;
// the game's own state (credits, ranks, shop, day log) is `game.<profile>.agent`. Every save is best-effort.
// `agent.html?debug` exposes window.agent for hand-testing (`&fixture` adds the test lesson as subject 'demo').
import { getActiveProfileId, loadSrs, saveSrs, loadLearn, saveLearn, loadGame, saveGame, loadSettings } from '../storage.js';
import { enSettings } from '../en/rules.js';
import { ensureProfiles, trackProfileId } from '../profiles.js';
import { holdToActivate } from '../hold.js';
import { loadDecks } from '../en/decks/index.js';
import { loadLessons, flattenSubjectLesson } from '../lessons/index.js';
import { ISLAND, LAYOUTS, parseLayout, beaconsFor } from './levels.js';
import { PLAYER, stepPlayer, groundAt, solidsOf, createRobot, stepRobot, caught, cellCenter, cellOf, near } from './world.js';
import * as M from './missions.js';
import * as R from './rules.js';
import { createScene } from './scene.js';
import { createInput } from './input.js';
import { createSound } from './sound.js';
import { playLock } from './locks.js';
import { el, createHud, showBriefing, showDebrief, showHideout, showParent, showIntro } from './ui.js';

const STEP = 1 / 60;
const NBSP = ' ';
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const today = () => R.localDay(new Date());
const EMP_RADIUS = 6;
const HIDE_S = 1.5; // after being caught, robots ignore him this long

// ---------------------------------------------------------------- profile, content, saves
let profileId = 'default';
try { profileId = trackProfileId(ensureProfiles(), getActiveProfileId(), 'en'); } catch (err) { console.warn('[agent] profiles unavailable', err); }

let catalog = [];
let beacons = [];
const chipIds = ISLAND.chips.map(c => c.id);
let game = R.normalize(null);

function loadState() {
    try { return R.normalize(loadGame(profileId, R.GAME_ID), { lessonIds: catalog.map(l => l.id), chipIds }); }
    catch { return R.normalize(null); }
}
const saveState = () => R.persist((s) => saveGame(profileId, R.GAME_ID, s), game);
// Lesson progress per track, read from storage once and kept in memory: with storage blocked (private mode, quota)
// what he answered still counts for the next mission of the visit.
const tracks = new Map();
const loadTrack = (trackId) => {
    if (!tracks.has(trackId)) {
        let srs = { cards: {}, introduced: {} }, learn = { cards: {}, formats: {} };
        try { srs = loadSrs(profileId, trackId); learn = loadLearn(profileId, trackId); } catch (err) { console.warn('[agent] progress unreadable', err); }
        tracks.set(trackId, { srs, learn });
    }
    return tracks.get(trackId);
};
const keepTrack = (trackId, srs, learn) => {
    tracks.set(trackId, { srs, learn });
    R.persist(() => { saveLearn(profileId, trackId, learn); saveSrs(profileId, trackId, srs); }, null);
};

async function loadContent() {
    const enDecks = await loadDecks();
    const subjects = { svt: await loadLessons('svt') };
    if (DEBUG && params.has('fixture')) {
        subjects.demo = flattenSubjectLesson(await (await fetch('tests/helpers/lesson-fixture.json')).json());
    }
    catalog = M.buildCatalog({ enDecks, subjects });
    beacons = beaconsFor(catalog);
}

// ---------------------------------------------------------------- page state
const app = {
    screen: 'boot',          // boot | hub | briefing | mission | debrief
    frozen: false,           // a panel or a card is open: the world waits
    player: { x: ISLAND.spawn.x, y: 0, z: ISLAND.spawn.z, vy: 0, grounded: true },
    face: Math.PI,
    yaw: 0,
    moving: false,
    nearBeacon: null,        // the beacon he stands on (no second briefing until he leaves it)
    nearHideout: false,
};
let mission = null;

// ---------------------------------------------------------------- 3D, input, sound, HUD
let scene = null;
try { scene = createScene($('view')); } catch (err) { console.error('[agent] WebGL unavailable', err); }

const input = createInput($('view'), {
    stick: $('stick'),
    buttons: { action: $('btnAction'), jump: $('btnJump'), sprint: $('btnSprint'), gadget: $('btnGadget') },
});
let enVoice = '';
try { enVoice = enSettings(loadSettings(profileId)).enVoice; } catch { /* default voice */ }
const sound = createSound({ enabled: true, voiceName: enVoice });
const hud = createHud();

let toastTimer = null;
function toast(text, ms = 2800) {
    const t = $('toast');
    clearTimeout(toastTimer);
    t.textContent = text;
    t.hidden = !text;
    if (text && ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function refreshHud() {
    hud.credits(game.credits);
    hud.rank(R.RANKS[R.rankOf(game.xp)].name);
    hud.sound(game.settings.sound);
    if (mission) {
        hud.locks(Math.min(mission.m.index, mission.m.total), mission.m.total, mission.type === 'sort' ? '📦' : '🔒');
        hud.alarm(mission.m.alarm);
        hud.gadget(mission.emp ? `⚡ IEM ×${mission.emp}` : mission.hint ? `🛸 ×${mission.hint}` : null);
        $('btnGadget').hidden = !mission.emp;
    } else {
        hud.gadget(null);
        $('btnGadget').hidden = true;
    }
}

const lessonOf = (id) => catalog.find(l => l.id === id);
const shortLabel = (lesson) => lesson.label.split(' · ')[0];

// The day's priority beacons (at most 3), chosen once a day: a test within a week, then the most to work on, then
// the lesson played longest ago.
function ensurePriority(day) {
    game = R.rollDay(game, day);
    if (game.priority.day === day) return;
    const hasVoice = sound.hasVoice();
    const tracks = {};
    const lessons = catalog.filter(l => M.missionTypes(l, { hasVoice }).length).map(l => {
        tracks[l.trackId] ??= loadTrack(l.trackId);
        return { id: l.id, exam: l.exam, need: M.needCount(l, { ...tracks[l.trackId], today: day, hasVoice }), lastPlayed: game.missions[l.id]?.last ?? null };
    });
    game = { ...game, priority: { day, ids: R.pickPriority(lessons, day), done: [] } };
    saveState();
}

// Beacon look: priority (gold, double pay), play (green), rest (grey: a training run), cap (red: come back tomorrow).
function refreshBeacons() {
    const day = today();
    ensurePriority(day);
    const hasVoice = sound.hasVoice();
    const tracks = {};
    for (const b of beacons) {
        const lesson = lessonOf(b.lessonId);
        tracks[lesson.trackId] ??= loadTrack(lesson.trackId);
        let state, sub;
        if (!M.missionTypes(lesson, { hasVoice }).length) { state = 'rest'; sub = '🔊 Avec le son anglais'; }
        else if (!R.canStart(game)) { state = 'cap'; sub = 'Reviens demain'; }
        else if (game.priority.ids.includes(lesson.id) && !game.priority.done.includes(lesson.id)) { state = 'priority'; sub = '⭐ Prioritaire · crédits ×2'; }
        else {
            const need = M.needCount(lesson, { ...tracks[lesson.trackId], today: day, hasVoice });
            state = need ? 'play' : 'rest';
            sub = need ? `${need} à réviser` : 'Rien à réviser aujourd’hui';
        }
        scene.setBeacon(b.lessonId, { state, lines: [{ text: shortLabel(lesson), size: 46 }, { text: sub, size: 34, bold: false }] });
    }
}

function showHub() {
    scene.showIsland(ISLAND, beacons, ISLAND.chips);
    refreshBeacons();
    scene.setOutfit(R.itemById(game.equipped.outfit)?.colors);
}

function showWorld() {
    if (mission) { scene.showRoom(mission.parsed, mission.type); if (mission.type === 'sort') drawZones(); }
    else showHub();
}

// ---------------------------------------------------------------- movement
const HALF = ISLAND.size / 2 - 3;

// The stick is in screen terms; turned by the camera yaw (the camera looks along (-sin yaw, -cos yaw)).
function walk(inp, dt, solids, speedFactor = 1) {
    const s = Math.sin(app.yaw), c = Math.cos(app.yaw);
    const mx = inp.dx * c - inp.dz * s, mz = -inp.dx * s - inp.dz * c;
    const speed = (inp.sprint ? PLAYER.sprint : PLAYER.speed) * speedFactor;
    const p = stepPlayer(app.player, { dx: mx, dz: mz, jump: inp.jump, speed }, dt, solids);
    app.moving = Math.hypot(mx, mz) > 0.05;
    if (app.moving) app.face = Math.atan2(mx, mz);
    app.player = p;
}

function tickHub(inp, dt) {
    walk(inp, dt, ISLAND.solids, game.owned.includes('board') ? PLAYER.boardFactor : 1);
    app.player.x = Math.max(-HALF, Math.min(HALF, app.player.x));
    app.player.z = Math.max(-HALF, Math.min(HALF, app.player.z));
    for (const c of ISLAND.chips) {
        if (game.chips.includes(c.id) || Math.hypot(app.player.x - c.x, app.player.z - c.z) > 1.2 || Math.abs(app.player.y - c.y) > 1.6) continue;
        const out = R.collectChip(game, c.id);
        game = out.state;
        saveState();
        sound.play('coin');
        toast(`💾 Puce de données${NBSP}! +${out.credits} crédits (${game.chips.length}${NBSP}/${NBSP}${ISLAND.chips.length})`);
        refreshHud();
    }
    if (app.nearHideout && !near(app.player, ISLAND.hideout, 4)) app.nearHideout = false;
    if (!app.nearHideout && near(app.player, ISLAND.hideout, 2.2)) { app.nearHideout = true; openHideout(); return; }
    const here = beacons.find(b => near(app.player, b, 1.8));
    if (app.nearBeacon && !near(app.player, app.nearBeacon, 3.5)) app.nearBeacon = null;
    if (here && here !== app.nearBeacon) { app.nearBeacon = here; openBriefing(here.lessonId); }
}

// ---------------------------------------------------------------- hideout and parent corner
function shopRows() {
    const rank = R.rankOf(game.xp);
    return R.CATALOG.map(item => ({
        item, owned: game.owned.includes(item.id),
        equipped: game.equipped.outfit === item.id || game.equipped.gadget === item.id,
        locked: rank < item.rank, rankName: R.RANKS[item.rank].name, affordable: game.credits >= item.cost,
    }));
}

async function openHideout() {
    freeze(true);
    const rank = R.rankOf(game.xp);
    const next = R.RANK_XP[rank + 1];
    await showHideout({
        rankName: R.RANKS[rank].name, nextName: next ? R.RANKS[rank + 1].name : null,
        progress: next ? (game.xp - R.RANK_XP[rank]) / (next - R.RANK_XP[rank]) : 1,
        credits: () => game.credits, shop: shopRows(), streak: R.streak(game.days, today()),
        best: catalog.map(l => ({ label: shortLabel(l), stars: game.missions[l.id]?.bestStars ?? 0 })),
        chips: { found: game.chips.length, total: ISLAND.chips.length },
        onBuy(id) {
            const before = game;
            game = R.buy(game, id);
            if (game !== before) { sound.play('coin'); toast(`✔ ${R.itemById(id).name}${NBSP}: acheté.`); saveState(); refreshHud(); }
            return shopRows();
        },
        onEquip(id) {
            game = R.equip(game, id);
            scene.setOutfit(R.itemById(game.equipped.outfit)?.colors);
            saveState();
            return shopRows();
        },
    });
    // Step out of the doorway so the planque does not open again at once.
    placeAt({ x: ISLAND.hideout.x, z: ISLAND.hideout.z + 3.5 });
    freeze(false);
}

async function openParent() {
    if (app.frozen || app.screen === 'boot') return;
    freeze(true);
    const hasVoice = sound.hasVoice();
    const tracks = {};
    const lessons = catalog.map(l => {
        tracks[l.trackId] ??= loadTrack(l.trackId);
        return { label: shortLabel(l), progress: M.progressOf(l, { ...tracks[l.trackId], hasVoice }) };
    });
    const day = today();
    await showParent({
        settings: game.settings, today: game.day === day ? game.missionsToday : 0, lessons,
        days: Object.entries(game.days).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 7),
        onSettings(patch) {
            game = R.normalize({ ...game, settings: { ...game.settings, ...patch } }, { lessonIds: catalog.map(l => l.id), chipIds });
            sound.setEnabled(game.settings.sound);
            saveState();
            refreshHud();
        },
        onReset() {
            game = R.rollDay(R.normalize({ seenIntro: true, settings: game.settings }, { lessonIds: catalog.map(l => l.id), chipIds }), today());
            saveState();
            scene.setOutfit(R.itemById(game.equipped.outfit)?.colors);
            refreshHud();
        },
    });
    if (!mission) refreshBeacons();
    freeze(false);
}
holdToActivate($('parentBtn'), openParent);

// ---------------------------------------------------------------- briefing → mission
async function openBriefing(lessonId) {
    const lesson = lessonOf(lessonId);
    const day = today();
    ensurePriority(day);
    if (!R.canStart(game)) {
        toast(`Plus de mission pour aujourd’hui${NBSP}: reviens demain${NBSP}! La planque reste ouverte.`, 4000);
        return;
    }
    const { srs, learn } = loadTrack(lesson.trackId);
    const hasVoice = sound.hasVoice();
    const type = M.pickType({ lesson, srs, learn, today: day, lastType: game.missions[lesson.id]?.lastType ?? null, hasVoice });
    if (!type) { toast(`Cette leçon se joue avec le son en anglais (🔊).`, 4000); return; }
    const training = !M.canRecord({ lesson, type, srs, learn, today: day, hasVoice });
    const priority = game.priority.ids.includes(lesson.id) && !game.priority.done.includes(lesson.id);
    app.screen = 'briefing';
    freeze(true);
    const choice = await showBriefing(lesson, type, { priority, training, exam: lesson.exam, today: day,
        index: catalog.filter(l => l.subject === lesson.subject).indexOf(lesson), say: (t) => sound.say(t) });
    sound.stop();
    freeze(false);
    app.screen = 'hub';
    if (choice === 'go') startMission({ lesson, type, training, srs, learn, hasVoice, day });
}

function freeze(on) {
    app.frozen = on;
    input.setEnabled(!on);
}

function startMission({ lesson, type, training, srs, learn, hasVoice, day }) {
    game = R.beginMission(game, { lessonId: lesson.id, type, today: day });
    saveState();
    const list = LAYOUTS[type];
    const parsed = parseLayout(list[Math.floor(Math.random() * list.length)]);
    const equipped = game.equipped.gadget;
    mission = {
        m: M.createMission({ lesson, type, hasVoice, training }), lesson, type, parsed, day, srs, learn, training,
        openDoors: new Set(), robots: parsed.patrols.map((p, i) => createRobot(p, i)), reserveOn: 0,
        runCredits: 0, locks: 0, firstTry: 0, caught: 0, hidden: 0, busy: false, exitOpen: false,
        respawn: cellCenter(parsed.spawn),
        emp: equipped === 'emp' ? 1 : 0, hint: equipped === 'hint' ? 2 : 0,
        sort: null, zoneCats: [], fences: [], zoneKey: '', litZone: null, lastZone: null,
    };
    app.screen = 'mission';
    scene.showRoom(parsed, type);
    if (type === 'sort') {
        const cats = mission.m.cards[0]?.deck.cats ?? [];
        assignZones(cats);
    }
    placeAt(mission.respawn);
    const first = parsed.locks[0] ?? parsed.dispenser ?? parsed.exit;
    const target = cellCenter(first);
    app.yaw = Math.atan2(-(target.x - app.player.x), -(target.z - app.player.z));
    hud.mission(true);
    refreshHud();
}

function placeAt(p) {
    app.player = { x: p.x, z: p.z, y: 0, vy: 0, grounded: true };
}

// ---------------------------------------------------------------- mission tick
let solidsKey = '', roomSolids = [];
function missionSolids() {
    const key = `${[...mission.openDoors].sort().join(',')}|${mission.zoneKey}`;
    if (key !== solidsKey || !roomSolids.length) { solidsKey = key; roomSolids = [...solidsOf(mission.parsed, mission.openDoors), ...mission.fences]; }
    return roomSolids;
}

function allDoorsOpen() {
    for (const l of mission.parsed.locks) mission.openDoors.add(l.i);
    mission.exitOpen = true;
}

function tickMission(inp, dt) {
    if (mission.busy) return;
    walk(inp, dt, missionSolids());
    mission.hidden = Math.max(0, mission.hidden - dt);
    if (inp.gadget && mission.emp > 0) {
        mission.emp--;
        let n = 0;
        mission.robots = mission.robots.map(r => (near(r, app.player, EMP_RADIUS) ? (n++, { ...r, frozenS: 5, mode: 'patrol', seenS: 0 }) : r));
        sound.play('stun');
        toast(n ? `⚡ IEM${NBSP}: ${n} robot${n > 1 ? 's' : ''} gelé${n > 1 ? 's' : ''} 5 secondes.` : `⚡ IEM${NBSP}: aucun robot assez près.`);
        refreshHud();
    }
    const target = mission.hidden > 0 ? null : app.player;
    mission.robots = mission.robots.map(r => stepRobot(r, target, dt, mission.parsed, mission.openDoors, mission.fences));
    if (target && mission.robots.some(r => caught(r, app.player))) { onCaught(); return; }
    if (mission.m.done && !mission.exitOpen) allDoorsOpen();
    if (mission.type === 'sort') tickSort(inp);
    else if (!mission.exitOpen) {
        const n = mission.m.index;
        const lock = mission.parsed.locks[n];
        if (lock) {
            const d = Math.hypot(app.player.x - cellCenter(lock).x, app.player.z - cellCenter(lock).z);
            if (d < 1.7 || (inp.action && d < 2.8)) openDoorLock(n);
        }
    }
    const cell = cellOf(app.player.x, app.player.z);
    if (mission.exitOpen && mission.parsed.exit && cell.x === mission.parsed.exit.x && cell.y === mission.parsed.exit.y) finishMission();
}

function onCaught() {
    mission.caught++;
    mission.hidden = HIDE_S;
    sound.play('caught');
    if (mission.type === 'sort') {
        // The crate goes back to the dispenser; the answer is not affected.
        if (mission.sort) mission.sort.phase = 'dispenser';
        toast(`Un drone t’a attrapé${NBSP}! La caisse retourne au distributeur.`);
    } else toast(`Repéré${NBSP}! Retour à la dernière porte ouverte.`);
    placeAt(mission.respawn);
    mission.robots = activePaths().map((p, i) => createRobot(p, i));
}

const activePaths = () => [...mission.parsed.patrols, ...mission.parsed.reserve.slice(0, mission.reserveOn)];

// The world waits while he answers: no timer on an answer.
async function openDoorLock(n) {
    const here = mission;
    here.busy = true;
    try {
        const now = new Date();
        const m = M.openLock(here.m, { srs: here.srs, learn: here.learn, today: here.day, now });
        here.m = m;
        if (m.done) {
            allDoorsOpen();
            toast(`Toutes les portes s’ouvrent${NBSP}! File vers la sortie.`);
            return;
        }
        const ex = M.exerciseFor(m.step, { cards: here.lesson.cards, now });
        const res = await showLock(ex, `🔒 Porte ${n + 1}${NBSP}/${NBSP}${here.m.total}`);
        if (mission !== here) return;
        afterLock(res);
        here.openDoors.add(n);
        here.respawn = cellCenter(here.parsed.locks[n]);
        sound.play('door');
    } catch (err) {
        // Never stuck behind a door: it opens, and the mission goes on.
        console.error('[agent] lock failed', err);
        if (mission === here) { here.openDoors.add(n); here.m = { ...here.m, index: here.m.index + 1, done: here.m.index + 1 >= here.m.total }; }
        closeLock();
    } finally {
        here.busy = false;
    }
}

// One answered lock: the lesson engine records it, the game pays for it, both are saved.
function afterLock(res) {
    const m = mission.m;
    const out = M.answerLock(m, { srs: mission.srs, learn: mission.learn, result: res.result, ms: res.ms, typed: res.typed, today: mission.day });
    mission.m = out.mission;
    mission.srs = out.srs;
    mission.learn = out.learn;
    const pay = R.payLock(game, { result: res.result, recorded: m.step.record, masteredNow: out.masteredNow });
    game = pay.state;
    mission.runCredits += pay.credits;
    mission.locks++;
    if (m.step.record && res.result === 'right') mission.firstTry++;
    keepTrack(mission.lesson.trackId, mission.srs, mission.learn);
    saveState();
    if (pay.credits) sound.play('coin');
    if (out.masteredNow) toast(`🏅 Maîtrisé${NBSP}! +${R.PAY.mastered} crédits.`);
    if (out.mission.alarm > m.alarm) {
        mission.reserveOn = Math.min(mission.parsed.reserve.length, out.mission.alarm);
        const fresh = mission.parsed.reserve.slice(mission.robots.length - mission.parsed.patrols.length, mission.reserveOn);
        mission.robots.push(...fresh.map((p, i) => createRobot(p, mission.robots.length + i)));
        sound.play('alarm');
        toast(`🚨 Alarme niveau ${out.mission.alarm}${NBSP}: plus de robots.`);
    }
    refreshHud();
}

// ---------------------------------------------------------------- sort run
const ZONE_COLORS = [0xff6b6b, 0x4f8cff, 0x37d67a, 0xffc93c];

// The group's categories take the layout's zones in order; the zones left over are fenced off.
function assignZones(cats) {
    const key = cats.map(c => c.id).join(',');
    if (key === mission.zoneKey) return;
    mission.zoneKey = key;
    mission.zoneCats = mission.parsed.zones.map((z, i) => cats[i] ?? null);
    mission.fences = mission.parsed.zones.filter((z, i) => !cats[i])
        .flatMap(z => z.tiles.map(t => ({ ...cellCenter(t), w: 2, d: 2, h: 1.2 })));
    drawZones();
}

function drawZones() {
    scene.setZones(mission.parsed.zones.map((z, i) => {
        const cat = mission.zoneCats[i];
        return { tiles: z.tiles, color: ZONE_COLORS[i % ZONE_COLORS.length], closed: !cat, lit: mission.litZone === i,
            fence: cat ? [] : z.tiles.map(t => ({ ...cellCenter(t), w: 2, d: 2, h: 1.2 })),
            lines: cat ? [{ text: cat.emoji ?? '', size: 70, emoji: true }, { text: cat.label, size: 52 }] : null };
    }));
}

const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y;
const zoneAt = (cell) => mission.parsed.zones.findIndex(z => z.tiles.some(t => sameCell(t, cell)));

function tickSort(inp) {
    const { parsed } = mission;
    const cell = cellOf(app.player.x, app.player.z);
    if (mission.exitOpen) return;
    const atDispenser = near(app.player, cellCenter(parsed.dispenser), 1.8) || (inp.action && near(app.player, cellCenter(parsed.dispenser), 3));
    if (!mission.sort && atDispenser) { takeNewCrate(); return; }
    if (mission.sort?.phase === 'dispenser' && atDispenser) { mission.sort.phase = 'carried'; mission.sort.t0 = Date.now(); sound.play('pick'); return; }
    if (mission.sort?.phase !== 'carried') { mission.lastZone = null; return; }
    const zi = zoneAt(cell);
    if (zi === mission.lastZone) return;
    mission.lastZone = zi;
    const cat = zi >= 0 ? mission.zoneCats[zi] : null;
    if (!cat) return;
    const { ex } = mission.sort;
    if (cat.id === ex.cat) {
        // Right zone: at the first drop it is right; after a wrong drop it was a miss (no retry in this type).
        const result = mission.sort.wrong ? 'miss' : 'right';
        afterLock({ result, ms: Date.now() - mission.sort.t0, typed: mission.sort.wrong ?? '' });
        sound.play(result === 'right' ? 'right' : 'door');
        toast(result === 'right' ? `✅ Bien rangé${NBSP}!` : `Rangé. Cette caisse reviendra un autre jour.`, 1800);
        mission.sort = null;
        mission.litZone = null;
        drawZones();
        return;
    }
    if (!mission.sort.wrong) {
        // Wrong zone: the crate stays in his hands, the right zone lights up and its name is shown.
        mission.sort.wrong = cat.id;
        mission.litZone = mission.zoneCats.findIndex(c => c?.id === ex.cat);
        drawZones();
        sound.play('wrong');
        const right = ex.cats.find(c => c.id === ex.cat);
        toast(`❌ Pas ici${NBSP}: ${ex.label} → ${right?.emoji ?? ''} ${right?.label ?? ''}. Porte-la dans la zone qui brille.`, 4500);
    }
}

function takeNewCrate() {
    const m = M.openLock(mission.m, { srs: mission.srs, learn: mission.learn, today: mission.day });
    mission.m = m;
    if (m.done) { allDoorsOpen(); toast(`Toutes les caisses sont rangées${NBSP}! File vers la sortie.`); return; }
    const ex = M.exerciseFor(m.step, { cards: mission.lesson.cards });
    assignZones(ex.cats);
    mission.sort = { ex, phase: 'carried', wrong: null, t0: Date.now() };
    mission.lastZone = zoneAt(cellOf(app.player.x, app.player.z));
    sound.play('pick');
    toast(`📦 ${ex.emoji ? `${ex.emoji} ` : ''}${ex.label}${NBSP}: range-la dans la bonne zone.`, 3000);
}

// ---------------------------------------------------------------- lock panel
const lockUi = { stage: $('lockStage'), feedback: $('lockFeedback'), say: () => Promise.resolve(), el, sleep, hintButton: $('hintBtn') };
let debugAnswer = null;

function placeLock() {
    const vv = globalThis.visualViewport;
    const p = $('lock');
    if (!vv) return;
    p.style.top = `${Math.max(0, vv.offsetTop)}px`;
    p.style.maxHeight = `${vv.height}px`;
}
globalThis.visualViewport?.addEventListener('resize', placeLock);
globalThis.visualViewport?.addEventListener('scroll', placeLock);

async function showLock(ex, title) {
    $('lockTitle').textContent = title;
    $('lockConsigne').textContent = ex.consigne ?? '';
    lockUi.stage.replaceChildren();
    lockUi.feedback.replaceChildren();
    lockUi.say = mission.lesson.subject === 'en' ? (t) => sound.say(t) : () => Promise.resolve();
    $('lock').hidden = false;
    placeLock();
    freeze(true);
    const here = mission;
    const hint = here.hint > 0 ? () => { if (mission !== here || here.hint <= 0) return false; here.hint--; refreshHud(); return true; } : null;
    const res = await Promise.race([
        playLock(ex, lockUi, { hint }),
        new Promise(resolve => { debugAnswer = (result) => resolve({ result, ms: 5000, typed: result === 'miss' ? 'debug' : '' }); }),
    ]);
    debugAnswer = null;
    closeLock();
    return res;
}

function closeLock() {
    sound.stop();
    $('lock').hidden = true;
    $('hintBtn').hidden = true;
    lockUi.stage.replaceChildren();
    lockUi.feedback.replaceChildren();
    freeze(false);
}

// ---------------------------------------------------------------- end of a mission
async function finishMission() {
    const done = mission;
    done.busy = true;
    const stars = M.stars(done.m);
    const fin = R.finishMission(game, { lessonId: done.lesson.id, stars, runCredits: done.runCredits, today: done.day,
        locks: done.locks, firstTry: done.firstTry, caught: done.caught });
    game = fin.state;
    saveState();
    refreshHud();
    sound.play(fin.rankUp ? 'rank' : 'right');
    freeze(true);
    app.screen = 'debrief';
    try {
        await showDebrief({ stars, credits: done.runCredits + fin.credits, rankUp: fin.rankUp ? R.RANKS[R.rankOf(game.xp)].name : null,
            missed: M.missed(done.m, done.lesson.cards), training: done.training, caught: done.caught });
    } finally {
        backToHub(done.lesson.id);
    }
}

// 🏠 mid-mission: what he answered stays recorded and paid; no star pay; the mission counted when it started.
async function quitMission() {
    // While a lock panel waits for his answer, 🏠 does nothing: the panel is the only thing to finish.
    if (!mission || app.screen !== 'mission' || mission.busy || app.frozen) return;
    const done = mission;
    game = R.quitMission(game, { today: done.day, locks: done.locks, firstTry: done.firstTry });
    saveState();
    freeze(true);
    app.screen = 'debrief';
    try { await showDebrief({ quit: true, credits: done.runCredits, missed: M.missed(done.m, done.lesson.cards) }); }
    finally { backToHub(done.lesson.id); }
}

function backToHub(lessonId) {
    mission = null;
    solidsKey = '';
    hud.mission(false);
    app.screen = 'hub';
    showHub();
    const b = beacons.find(x => x.lessonId === lessonId);
    placeAt(b ? { x: b.x, z: b.z + 4 } : ISLAND.spawn);
    app.nearBeacon = null;
    app.yaw = 0;
    freeze(false);
    refreshHud();
}

{   // 🏠 quits on a 0.8 s hold or two taps within 2 s.
    const btn = $('quitBtn');
    let hold = null, armed = null, held = false;
    const release = () => { clearTimeout(hold); hold = null; };
    btn.addEventListener('pointerdown', () => { release(); held = false; hold = setTimeout(() => { held = true; quitMission(); }, 800); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
    btn.addEventListener('click', () => {
        if (held) { held = false; return; } // the click that ends a hold
        if (armed) { clearTimeout(armed); armed = null; quitMission(); return; }
        toast('Touche encore 🏠 pour quitter la mission.', 2000);
        armed = setTimeout(() => { armed = null; }, 2000);
    });
}

$('soundBtn').addEventListener('click', () => {
    game = { ...game, settings: { ...game.settings, sound: !game.settings.sound } };
    sound.setEnabled(game.settings.sound);
    saveState();
    refreshHud();
});

// ---------------------------------------------------------------- loop
function tick(dt, inp) {
    app.yaw += inp.yawDelta;
    if (app.frozen) return;
    if (app.screen === 'hub') tickHub(inp, dt);
    else if (app.screen === 'mission' && mission) tickMission(inp, dt);
}

function view() {
    const solids = mission ? missionSolids() : ISLAND.solids;
    const nextLock = mission && !mission.exitOpen ? mission.parsed.locks[mission.m.index]?.i ?? null : null;
    return {
        player: app.player, face: app.face, yaw: app.yaw, moving: app.moving && !app.frozen,
        groundY: groundAt(app.player.x, app.player.z, app.player.y, solids),
        board: !mission && game.owned.includes('board'),
        robots: mission ? mission.robots : [],
        crate: crateView(),
        openDoors: mission?.openDoors, nextDoor: nextLock, exitOpen: mission?.exitOpen,
        chips: chipSet(),
    };
}

let chipCache = { list: null, set: new Set() };
const chipSet = () => { if (chipCache.list !== game.chips) chipCache = { list: game.chips, set: new Set(game.chips) }; return chipCache.set; };

// Where the current sort crate is drawn: over his head, or back on the dispenser.
function crateView() {
    const s = mission?.sort;
    scene.setCrate(s ? { text: s.ex.label, emoji: s.ex.emoji } : null);
    if (!s) return null;
    if (s.phase === 'carried') return { x: app.player.x, y: app.player.y + 2.6, z: app.player.z };
    const d = cellCenter(mission.parsed.dispenser);
    return { x: d.x, y: 1.6, z: d.z };
}

let last = performance.now();
let acc = 0;
const slow = { t: 0, frames: 0, sum: 0 };

// Lower the pixel ratio by 0.25 (down to 1) when the average frame over 2 s is slower than 22 ms.
function autoQuality(dt) {
    slow.t += dt; slow.frames++; slow.sum += dt;
    if (slow.t < 2) return;
    const avg = slow.sum / slow.frames;
    slow.t = slow.frames = slow.sum = 0;
    const pr = scene.pixelRatio();
    if (avg > 0.022 && pr > 1) scene.setQuality(Math.max(1, pr - 0.25));
}

function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (app.screen === 'boot' || !scene || app.lost) return;
    if (!document.hidden) {
        const inp = input.read();
        acc += dt;
        let first = true;
        while (acc >= STEP) {
            tick(STEP, first ? inp : { ...inp, yawDelta: 0, jump: false, action: false, gadget: false });
            first = false;
            acc -= STEP;
        }
    } else acc = 0;
    autoQuality(dt);
    scene.update(view());
}

// Background (home button, other app): the loop stops; the mission resumes as it was.
document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; if (document.hidden) sound.stop(); });
globalThis.addEventListener('resize', () => scene?.resize());
globalThis.visualViewport?.addEventListener('resize', () => scene?.resize());
$('view').addEventListener('webglcontextlost', (e) => { e.preventDefault(); app.lost = true; toast('Affichage interrompu… un instant.', 0); });
$('view').addEventListener('webglcontextrestored', () => { app.lost = false; showWorld(); toast(''); });

// ---------------------------------------------------------------- boot
function fatal(text) {
    $('startNote').replaceChildren(text, ' ', el('a', { href: 'en.html' }, 'Réviser sur la page d’anglais'));
    $('playBtn').hidden = true;
}

async function boot() {
    if (!scene) { fatal('Cet appareil ne peut pas afficher la 3D (WebGL).'); return; }
    try { await loadContent(); } catch (err) { console.error(err); fatal('Les leçons ne se chargent pas.'); return; }
    game = R.rollDay(loadState(), today());
    sound.setEnabled(game.settings.sound);
    $('startNote').textContent = 'Reprends les bâtiments de l’île, une serrure à la fois.';
    $('playBtn').disabled = false;
    $('playBtn').addEventListener('click', () => {
        sound.unlock(); // inside the tap (iOS)
        $('start').hidden = true;
        $('hud').hidden = false;
        $('controls').hidden = false;
        app.screen = 'hub';
        showHub();
        refreshHud();
        if (!game.seenIntro) {
            freeze(true);
            showIntro().then(() => { game = { ...game, seenIntro: true }; saveState(); freeze(false); });
        }
    });
    requestAnimationFrame(frame);
}
boot();

if (DEBUG) {
    globalThis.agent = {
        get state() { return app; },
        get game() { return game; },
        get mission() { return mission; },
        get catalog() { return catalog; },
        srs: (trackId) => loadTrack(trackId),
        teleport(x, z) {
            const solids = mission ? missionSolids() : ISLAND.solids;
            app.player = { ...app.player, x, z, y: groundAt(x, z, 99, solids), vy: 0 };
        },
        tick(dt = STEP, inp = {}) {
            const n = Math.max(1, Math.round(dt / STEP));
            for (let i = 0; i < n; i++) tick(STEP, { dx: 0, dz: 0, yawDelta: 0, ...inp });
            scene.update(view());
            return { ...app.player };
        },
        info: () => ({ ...scene.info(), pixelRatio: scene.pixelRatio() }),
        briefing: (lessonId) => (!mission && !app.frozen ? openBriefing(lessonId) : false),
        // Walks up to the next lock door and opens its panel.
        openNext() {
            if (!mission || mission.busy || mission.exitOpen) return false;
            const n = mission.m.index;
            openDoorLock(n);
            return true;
        },
        answer: (result) => { if (debugAnswer) { debugAnswer(result); return true; } return false; },
        toExit() { if (mission?.parsed.exit) { const c = cellCenter(mission.parsed.exit); app.player = { ...app.player, x: c.x, z: c.z }; } },
    };
}
