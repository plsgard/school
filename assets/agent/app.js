// assets/agent/app.js
// Agent L (agent.html): the page. A state machine boot → hub → briefing → mission → debrief → hub, a fixed 1/60 s
// simulation step and one render per animation frame, paused while the page is hidden or a panel is open.
// Decisions come from the pure modules (rules, missions, world, levels); scene.js draws, input.js listens, ui.js /
// locks.js / sound.js speak to the child. Learning state (learn / srs) is the lesson engine's, shared with en.html;
// the game's own state (credits, ranks, shop, day log) is `game.<profile>.agent`. Every save is best-effort.
// `agent.html?debug` exposes window.agent for hand-testing (`&fixture` adds the test lesson as subject 'demo').
import { getActiveProfileId, loadSrs, saveSrs, loadLearn, saveLearn, loadGame, saveGame } from '../storage.js';
import { ensureProfiles, trackProfileId } from '../profiles.js';
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
import { el, createHud, showBriefing, showDebrief } from './ui.js';

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
const loadTrack = (trackId) => {
    let srs = { cards: {}, introduced: {} }, learn = { cards: {}, formats: {} };
    try { srs = loadSrs(profileId, trackId); learn = loadLearn(profileId, trackId); } catch (err) { console.warn('[agent] progress unreadable', err); }
    return { srs, learn };
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
};
let mission = null;

// ---------------------------------------------------------------- 3D, input, sound, HUD
let scene = null;
try { scene = createScene($('view')); } catch (err) { console.error('[agent] WebGL unavailable', err); }

const input = createInput($('view'), {
    stick: $('stick'),
    buttons: { action: $('btnAction'), jump: $('btnJump'), sprint: $('btnSprint'), gadget: $('btnGadget') },
});
const sound = createSound({ enabled: true });
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

function showHub() {
    scene.showIsland(ISLAND, beacons, ISLAND.chips);
    for (const b of beacons) {
        const lesson = lessonOf(b.lessonId);
        scene.setBeacon(b.lessonId, { state: 'play', lines: [{ text: shortLabel(lesson), size: 48 }] });
    }
    scene.setOutfit(R.itemById(game.equipped.outfit)?.colors);
}

function showWorld() {
    if (mission) scene.showRoom(mission.parsed, mission.type);
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
    walk(inp, dt, ISLAND.solids, R.itemById('board') && game.owned.includes('board') ? PLAYER.boardFactor : 1);
    app.player.x = Math.max(-HALF, Math.min(HALF, app.player.x));
    app.player.z = Math.max(-HALF, Math.min(HALF, app.player.z));
    const here = beacons.find(b => near(app.player, b, 1.8));
    if (app.nearBeacon && !near(app.player, app.nearBeacon, 3.5)) app.nearBeacon = null;
    if (here && here !== app.nearBeacon) { app.nearBeacon = here; openBriefing(here.lessonId); }
}

// ---------------------------------------------------------------- briefing → mission
async function openBriefing(lessonId) {
    const lesson = lessonOf(lessonId);
    const day = today();
    game = R.rollDay(game, day);
    if (!R.canStart(game)) {
        toast(`Plus de mission pour aujourd’hui${NBSP}: reviens demain${NBSP}! La planque reste ouverte.`, 4000);
        return;
    }
    const { srs, learn } = loadTrack(lesson.trackId);
    const hasVoice = sound.hasVoice();
    let type = M.pickType({ lesson, srs, learn, today: day, lastType: game.missions[lesson.id]?.lastType ?? null, hasVoice });
    if (type === 'sort' && M.missionTypes(lesson, { hasVoice }).includes('infiltration')) type = 'infiltration'; // sort run: Task 9
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
    };
    app.screen = 'mission';
    scene.showRoom(parsed, type);
    placeAt(mission.respawn);
    const first = parsed.locks[0] ?? parsed.exit;
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
    const key = [...mission.openDoors].sort().join(',');
    if (key !== solidsKey || !roomSolids.length) { solidsKey = key; roomSolids = solidsOf(mission.parsed, mission.openDoors); }
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
    mission.robots = mission.robots.map(r => stepRobot(r, target, dt, mission.parsed, mission.openDoors));
    if (target && mission.robots.some(r => caught(r, app.player))) { onCaught(); return; }
    if (mission.m.done && !mission.exitOpen) allDoorsOpen();
    if (!mission.exitOpen) {
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
    toast(`Repéré${NBSP}! Retour à la dernière porte ouverte.`);
    placeAt(mission.respawn);
    mission.robots = activePaths().map((p, i) => createRobot(p, i));
}

const activePaths = () => [...mission.parsed.patrols, ...mission.parsed.reserve.slice(0, mission.reserveOn)];

// The world waits while he answers: no timer on an answer.
async function openDoorLock(n) {
    mission.busy = true;
    const now = new Date();
    let m = M.openLock(mission.m, { srs: mission.srs, learn: mission.learn, today: mission.day, now });
    mission.m = m;
    if (m.done) {
        allDoorsOpen();
        toast(`Toutes les portes s’ouvrent${NBSP}! File vers la sortie.`);
        mission.busy = false;
        return;
    }
    const ex = M.exerciseFor(m.step, { cards: mission.lesson.cards, now });
    const res = await showLock(ex, `🔒 Porte ${n + 1}${NBSP}/${NBSP}${mission.m.total}`);
    if (!mission) return; // quit while the panel was open
    afterLock(res);
    mission.openDoors.add(n);
    mission.respawn = cellCenter(mission.parsed.locks[n]);
    sound.play('door');
    mission.busy = false;
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
    const { trackId } = mission.lesson;
    R.persist(() => { saveLearn(profileId, trackId, mission.learn); saveSrs(profileId, trackId, mission.srs); }, null);
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
    const hint = mission.hint > 0 ? () => { if (mission.hint <= 0) return false; mission.hint--; refreshHud(); return true; } : null;
    const res = await Promise.race([
        playLock(ex, lockUi, { hint }),
        new Promise(resolve => { debugAnswer = (result) => resolve({ result, ms: 5000, typed: result === 'miss' ? 'debug' : '' }); }),
    ]);
    debugAnswer = null;
    sound.stop();
    $('lock').hidden = true;
    $('hintBtn').hidden = true;
    freeze(false);
    return res;
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
    await showDebrief({ stars, credits: done.runCredits + fin.credits, rankUp: fin.rankUp ? R.RANKS[R.rankOf(game.xp)].name : null,
        missed: M.missed(done.m, done.lesson.cards), training: done.training, caught: done.caught });
    backToHub(done.lesson.id);
}

// 🏠 mid-mission: what he answered stays recorded and paid; no star pay; the mission counted when it started.
async function quitMission() {
    if (!mission || app.screen !== 'mission') return;
    const done = mission;
    game = R.quitMission(game, { today: done.day, locks: done.locks, firstTry: done.firstTry });
    saveState();
    freeze(true);
    app.screen = 'debrief';
    await showDebrief({ quit: true, credits: done.runCredits, missed: M.missed(done.m, done.lesson.cards) });
    backToHub(done.lesson.id);
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
    let hold = null, armed = null;
    const release = () => { clearTimeout(hold); hold = null; };
    btn.addEventListener('pointerdown', () => { release(); hold = setTimeout(quitMission, 800); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
    btn.addEventListener('click', () => {
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
        openDoors: mission?.openDoors, nextDoor: nextLock, exitOpen: mission?.exitOpen,
        chips: new Set(game.chips),
    };
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
        briefing: (lessonId) => openBriefing(lessonId),
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
