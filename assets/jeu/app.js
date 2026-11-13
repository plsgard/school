// assets/jeu/app.js
// « L’île des Gribouilles » (jeu.html): the canvas game. Two scenes share one loop:
//  - the village (walk by tap or keys, six gates to the biomes, build with crystals, freed friends);
//  - the arena (an expedition: a question on top, each gribouille carries an answer, throw a star at the right one).
// Rules, questions and geometry are pure modules (rules.js, questions.js, world.js); this file is input, drawing and DOM.
import { getActiveProfileId, loadGame, saveGame } from '../storage.js';
import { ensureProfiles, trackProfileId } from '../profiles.js';
import { holdToActivate } from '../hold.js';
import * as R from './rules.js';
import { generate, skillById, shuffle } from './questions.js';
import { dist, toward, clamp, moveInArena, hits, spawnPoints, moveOnGrid, discTiles } from './world.js';

const GAME = 'ile';
const NBSP = '\u00a0';
const TILE = 64;
const WORLD = { w: R.COLS * TILE, h: R.ROWS * TILE };
// Room around the island so the HUD (top) and the tray (bottom) never hide a gate.
const MARGIN = { x: 40, top: 96, bottom: 150 };
const HERO_R = 20;
const RANGE = 290;
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const TEXT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c); // strings become text nodes: never innerHTML
    return node;
}

// ---------------------------------------------------------------- State
let profileId = 'default';
let heroName = '';
try {
    const profiles = ensureProfiles();
    profileId = trackProfileId(profiles, getActiveProfileId(), 'ce2');
    heroName = profiles.find(p => p.id === profileId)?.name ?? '';
} catch (err) { console.warn('[jeu] profiles unavailable', err); }

let state;
try { state = R.normalize(loadGame(profileId, GAME)); } catch { state = R.normalize(null); }
const save = () => { try { saveGame(profileId, GAME, state); } catch (err) { console.warn('[jeu] progress not saved', err); } };
const today = () => R.localDay(new Date());
state = R.withDailyBonus(state, today());

// ---------------------------------------------------------------- Sound (tiny synth, no files)
let audio = null;
function beep(freq, dur = 0.08, type = 'sine', vol = 0.07, slide = 0, delay = 0) {
    if (!state.settings.sound) return;
    try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        const t = audio.currentTime + delay;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    } catch { /* no sound on this device: the game goes on */ }
}
const sfx = {
    throw: () => beep(520, 0.07, 'triangle', 0.05, 320),
    good: () => { beep(660, 0.09); beep(880, 0.14, 'sine', 0.07, 0, 0.09); },
    bad: () => beep(190, 0.2, 'sawtooth', 0.045, -70),
    gem: () => beep(1250, 0.05, 'sine', 0.04),
    star: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, 'triangle', 0.07, 0, i * 0.1)),
    place: () => beep(300, 0.06, 'square', 0.04, 120),
    tick: () => beep(420, 0.04, 'sine', 0.04),
};

// ---------------------------------------------------------------- Canvas
const canvas = $('stage');
const ctx = canvas.getContext('2d');
let W = 800, H = 560, scale = 1, dpr = 1;
// The village has its own zoom: the whole island fits the screen when the screen is big enough (tablet, laptop).
let VW = 800, VH = 560, vscale = 1;
function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = clamp(Math.min(vw, vh) / 560, 0.55, 2);
    W = vw / scale;
    H = vh / scale;
    vscale = clamp(Math.min(vw / (WORLD.w + 2 * MARGIN.x), vh / (WORLD.h + MARGIN.top + MARGIN.bottom)), 0.5, 1.5);
    VW = vw / vscale;
    VH = vh / vscale;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    if (arena) layoutArena(); else followHero();
}
window.addEventListener('resize', resize);
const toGame = (e) => ({ x: e.clientX / scale, y: e.clientY / scale });
const toVillage = (e) => ({ x: e.clientX / vscale, y: e.clientY / vscale });

function emoji(char, x, y, size, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000'; // Chromium applies the fill alpha to colour emoji
    ctx.font = `${size}px ${EMOJI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, x, y);
    ctx.globalAlpha = 1;
}
function shadow(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
}
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ---------------------------------------------------------------- Overlays
let dialogOpen = false;
let tipTimer = 0;
function tip(text, ms = 2600) {
    $('tip').textContent = text;
    $('tip').hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { $('tip').hidden = true; }, ms);
}
function openDialog(...children) {
    keys.clear();
    stick.id = null;
    dialogOpen = true;
    $('card').replaceChildren(...children.flat().filter(Boolean));
    $('dialog').hidden = false;
    $('card').querySelector('button.primary, button')?.focus({ preventScroll: true });
    $('card').scrollTop = 0;
}
function closeDialog() { dialogOpen = false; $('dialog').hidden = true; }
const cta = (label, onclick, primary = false) => el('button', { type: 'button', class: `jeu-cta${primary ? ' primary' : ''}`, onclick }, label);
const starLine = (n, max) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));

function bump(node) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
function hud() {
    $('crystals').textContent = `💎 ${state.crystals}`;
    $('stars').textContent = `⭐ ${R.totalStars(state)}`;
    $('soundBtn').textContent = state.settings.sound ? '🔊' : '🔇';
    $('buildBtn').setAttribute('aria-pressed', String(village.mode === 'build'));
    $('heroBtn').setAttribute('aria-pressed', String(village.mode === 'heroes'));
}

// ---------------------------------------------------------------- Input
const keys = new Set();
const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
window.addEventListener('keydown', (e) => {
    if (dialogOpen) { if (e.code === 'Escape') $('card').querySelector('[data-cancel]')?.click(); return; }
    if (!MOVE_KEYS.includes(e.code)) return;
    e.preventDefault();
    if (e.code === 'Space') { if (!e.repeat && arena) throwAt({ x: arena.hero.x + arena.hero.fx * 200, y: arena.hero.y + arena.hero.fy * 200 }); return; }
    keys.add(e.code);
    village.target = null;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// e.code is the physical key: W/A/S/D positions are Z/Q/S/D on a French keyboard.
function keyDir() {
    const x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    const y = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
    return { x, y };
}

// Arena, touch: a finger on the left part of the screen is a floating joystick; a short tap anywhere throws.
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, moved: false, t0: 0 };
const STICK_R = 54;
// Village, build mode: dragging pans the camera, a tap builds.
const drag = { id: null, sx: 0, sy: 0, camX: 0, camY: 0, moved: false };

canvas.addEventListener('pointerdown', (e) => {
    if (dialogOpen || e.button > 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a drag that ends off the canvas still ends */ }
    if (arena) {
        if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.42 && stick.id === null) {
            Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, moved: false, t0: performance.now() });
            return;
        }
        throwAt(toGame(e));
        return;
    }
    Object.assign(drag, { id: e.pointerId, sx: e.clientX, sy: e.clientY, camX: village.cam.x, camY: village.cam.y, moved: false });
});
canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
        const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > 10) stick.moved = true;
        const k = d > STICK_R ? STICK_R / d : 1;
        stick.x = (dx * k) / STICK_R;
        stick.y = (dy * k) / STICK_R;
    } else if (e.pointerId === drag.id && !arena) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.hypot(dx, dy) > 10) drag.moved = true;
        if (drag.moved && village.mode === 'build') { village.cam.x = drag.camX - dx / vscale; village.cam.y = drag.camY - dy / vscale; clampCam(); }
    }
});
function pointerEnd(e) {
    if (e.pointerId === stick.id) {
        const tap = !stick.moved && performance.now() - stick.t0 < 350;
        stick.id = null; stick.x = 0; stick.y = 0;
        if (tap && arena && e.type === 'pointerup') throwAt(toGame(e));
    } else if (e.pointerId === drag.id) {
        drag.id = null;
        if (!drag.moved && !arena && !dialogOpen && e.type === 'pointerup') villageTap(toVillage(e));
    }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- Village
const tileCenter = (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
const village = {
    hero: tileCenter(R.SPAWN.x, R.SPAWN.y), target: null, stuck: 0, cam: { x: 0, y: 0 },
    mode: 'walk', selected: null, npcs: [], gateLock: null,
};
const solidTile = (tx, ty) => R.isSolid(state, tx, ty);
const portalAt = (tx, ty) => R.PORTALS.find(p => p.x === tx && p.y === ty);

function clampCam() {
    const c = village.cam;
    const fit = (v, lo, hi, size, world) => (hi < lo ? (world - size) / 2 : clamp(v, lo, hi));
    c.x = fit(c.x, -MARGIN.x, WORLD.w + MARGIN.x - VW, VW, WORLD.w);
    c.y = fit(c.y, -MARGIN.top, WORLD.h + MARGIN.bottom - VH, VH, WORLD.h + MARGIN.bottom - MARGIN.top);
}
function followHero() {
    village.cam.x = village.hero.x - VW / 2;
    village.cam.y = village.hero.y - VH / 2;
    clampCam();
}

// Where a freed friend appears: a free tile near the middle of the island (the spawn tile is never built on).
function freeSpot() {
    for (let i = 0; i < 30; i++) {
        const tx = R.SPAWN.x + Math.round((Math.random() - 0.5) * 6), ty = R.SPAWN.y + Math.round((Math.random() - 0.5) * 4);
        if (!solidTile(tx, ty) && !portalAt(tx, ty)) return tileCenter(tx, ty);
    }
    return tileCenter(R.SPAWN.x, R.SPAWN.y);
}
function syncFriends() {
    const wanted = R.friends(state);
    village.npcs = wanted.map(f => village.npcs.find(n => n.biome === f.biome) ?? {
        ...f, ...freeSpot(), vx: 0, vy: 0, t: 0,
    });
}

const FRIEND_LINES = ['Merci de m’avoir libéré !', 'Ton village est super !', 'Tu deviens très fort !', 'J’adore habiter ici.'];
function villageTap(p) {
    const w = { x: p.x + village.cam.x, y: p.y + village.cam.y };
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    if (village.mode === 'build' && village.selected) { build(tx, ty); return; }
    const npc = village.npcs.find(n => dist(n, w) < 44);
    if (npc) {
        const bonus = R.biomeById(R.bonusBiome(state));
        tip(`${npc.emoji} ${Math.random() < 0.5 && R.isBonus(state, bonus.id, today()) ? `Aujourd’hui, les cristaux comptent double${NBSP}: ${bonus.name}${NBSP}!` : FRIEND_LINES[Math.floor(Math.random() * FRIEND_LINES.length)].replace(/ !/g, `${NBSP}!`)}`, 3600);
        return;
    }
    // A tap on a gate or on its label (generous: small targets for small fingers) walks into the gate.
    const gate = R.PORTALS.find(g => dist(tileCenter(g.x, g.y), w) < 72);
    village.target = gate ? tileCenter(gate.x, gate.y) : { x: clamp(w.x, HERO_R, WORLD.w - HERO_R), y: clamp(w.y, HERO_R, WORLD.h - HERO_R) };
    village.stuck = 0;
    if (gate) village.gateLock = null;
}

function build(tx, ty) {
    if (village.selected === 'erase') {
        const next = R.remove(state, tx, ty);
        if (!next) return;
        state = next;
        sfx.tick();
    } else {
        const item = R.itemById(village.selected);
        const blocks = !item.ground || item.solid;
        // the whole body counts, not its centre: a tree on a tile the hero or a friend overlaps would lock them in
        const under = (who, r) => discTiles(who, r, TILE).some(t => t.x === tx && t.y === ty);
        if (!R.buildable(tx, ty)) { if (tx >= 0 && ty >= 0 && tx < R.COLS && ty < R.ROWS) tip(`Pas ici${NBSP}: il faut laisser le passage.`); return; }
        if (R.itemAt(state, tx, ty)) { tip('Il y a déjà quelque chose ici. Prends le balai 🧹 pour l’enlever.'); return; }
        if (blocks && under(village.hero, HERO_R)) { tip(`Tu es dessus${NBSP}! Déplace-toi d’abord.`); return; }
        if (blocks && village.npcs.some(n => under(n, 16))) { tip('Ton ami est là. Attends qu’il se pousse.'); return; }
        const next = R.place(state, tx, ty, item.id);
        if (!next) { tip(`Il te manque des cristaux 💎. Pars en expédition${NBSP}!`); return; }
        state = next;
        sfx.place();
    }
    save();
    hud();
    bump($('crystals'));
    renderTray();
}

function renderTray() {
    const tray = $('tray');
    tray.hidden = village.mode === 'walk';
    if (tray.hidden) return;
    const item = (face, label, pressed, disabled, onclick, aria) => el('button', { type: 'button', class: 'jeu-item', 'aria-pressed': String(pressed), disabled, onclick, 'aria-label': aria },
        face.startsWith('#') ? el('b', { class: 'jeu-swatch', style: `background:${face}` }) : el('b', {}, face), el('small', {}, label));
    if (village.mode === 'build') {
        const total = R.totalStars(state);
        const select = (id) => () => { village.selected = village.selected === id ? null : id; renderTray(); };
        tray.replaceChildren(
            item('🧹', 'Enlever', village.selected === 'erase', false, select('erase'), 'Enlever'),
            ...R.CATALOG.map(i => (total < i.stars
                ? item('🔒', `⭐ ${i.stars}`, false, true, null, `${i.name}, à ${i.stars} étoiles`)
                : item(i.emoji ?? i.ground, `💎 ${i.cost}`, village.selected === i.id, state.crystals < i.cost, select(i.id), `${i.name}, ${i.cost} ${i.cost > 1 ? 'cristaux' : 'cristal'}`))),
        );
    } else {
        tray.replaceChildren(...R.HEROES.map(h => {
            const owned = state.heroes.includes(h.id);
            return item(h.emoji, owned ? (state.hero === h.id ? '✔' : 'Choisir') : `💎 ${h.cost}`, state.hero === h.id, !owned && state.crystals < h.cost, () => {
                const next = R.buyHero(state, h.id);
                if (!next) return;
                if (!owned) sfx.star(); else sfx.tick();
                state = next;
                save(); hud(); renderTray();
            }, owned ? 'Choisir ce héros' : `Héros à ${h.cost} cristaux`);
        }));
    }
}
function setMode(mode) {
    village.mode = village.mode === mode ? 'walk' : mode;
    village.selected = null;
    village.target = null;
    hud();
    renderTray();
    if (village.mode === 'build') tip('Choisis un objet, puis touche une case. Glisse pour regarder ailleurs.', 3600);
}
$('buildBtn').addEventListener('click', () => setMode('build'));
$('heroBtn').addEventListener('click', () => setMode('heroes'));
$('soundBtn').addEventListener('click', () => { state.settings.sound = !state.settings.sound; save(); hud(); sfx.tick(); });

function updateVillage(dt) {
    const v = village;
    const k = keyDir();
    let dx = k.x, dy = k.y;
    if (!dx && !dy && v.target) {
        if (dist(v.hero, v.target) < 4) v.target = null;
        else { const d = toward(v.hero, v.target); dx = d.x; dy = d.y; }
    }
    if (dx || dy) {
        const n = Math.hypot(dx, dy);
        const step = Math.min(250 * dt, v.target ? dist(v.hero, v.target) : Infinity);
        const next = moveOnGrid(v.hero, (dx / n) * step, (dy / n) * step, HERO_R, TILE, solidTile);
        if (v.target) { v.stuck = dist(next, v.hero) < step * 0.2 ? v.stuck + dt : 0; if (v.stuck > 0.4) v.target = null; }
        v.hero = next;
    }
    if (v.mode !== 'build' || dx || dy) { if (v.mode !== 'build' || drag.id === null) followHero(); }

    for (const n of v.npcs) {
        n.t -= dt;
        if (n.t <= 0) { const a = Math.random() * Math.PI * 2; const s = Math.random() < 0.4 ? 0 : 30; n.vx = Math.cos(a) * s; n.vy = Math.sin(a) * s; n.t = 1 + Math.random() * 3; }
        const p = moveOnGrid(n, n.vx * dt, n.vy * dt, 16, TILE, (tx, ty) => solidTile(tx, ty) || !!portalAt(tx, ty));
        n.x = p.x; n.y = p.y;
    }

    const tx = Math.floor(v.hero.x / TILE), ty = Math.floor(v.hero.y / TILE);
    const gate = portalAt(tx, ty);
    if (!gate) v.gateLock = null;
    else if (v.mode === 'walk' && v.gateLock !== gate.biome && dist(v.hero, tileCenter(tx, ty)) < 22) { v.gateLock = gate.biome; v.target = null; gateDialog(gate.biome); }
}

function drawVillage(now) {
    const v = village;
    ctx.fillStyle = '#5db7e6';
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(-Math.round(v.cam.x), -Math.round(v.cam.y));
    ctx.fillStyle = '#f0dc9a';
    roundRect(-18, -18, WORLD.w + 36, WORLD.h + 36, 30);
    ctx.fill();
    const x0 = clamp(Math.floor(v.cam.x / TILE), 0, R.COLS - 1), x1 = clamp(Math.floor((v.cam.x + VW) / TILE), 0, R.COLS - 1);
    const y0 = clamp(Math.floor(v.cam.y / TILE), 0, R.ROWS - 1), y1 = clamp(Math.floor((v.cam.y + VH) / TILE), 0, R.ROWS - 1);
    for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
            const item = R.itemAt(state, tx, ty);
            ctx.fillStyle = item?.ground ?? ((tx + ty) % 2 ? '#8fd17c' : '#86c973');
            ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
            if (v.mode === 'build') {
                ctx.strokeStyle = 'rgba(29,36,51,.14)';
                ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
                if (!R.buildable(tx, ty)) { ctx.fillStyle = 'rgba(29,36,51,.12)'; ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
            }
        }
    }
    const day = today();
    for (const p of R.PORTALS) {
        const b = R.biomeById(p.biome);
        const c = tileCenter(p.x, p.y);
        const pulse = 1 + Math.sin(now / 350 + p.x) * 0.04;
        ctx.fillStyle = b.ground[0];
        ctx.strokeStyle = '#1d2433';
        ctx.lineWidth = 3;
        roundRect(c.x - 29 * pulse, c.y - 29 * pulse, 58 * pulse, 58 * pulse, 16);
        ctx.fill();
        ctx.stroke();
        emoji(b.emoji, c.x, c.y - 2, 34);
        const label = `⭐ ${R.biomeStars(state, b.id)}/${R.biomeMaxStars(b.id)}${R.isBonus(state, b.id, day) ? ' ✨' : ''}`;
        ctx.font = `800 13px ${TEXT}`;
        const lw = ctx.measureText(label).width + 12;
        const ly = p.y === 0 ? c.y + 40 : c.y - 40;
        ctx.fillStyle = '#fff';
        roundRect(c.x - lw / 2, ly - 10, lw, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#1d2433';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, c.x, ly + 1);
    }
    for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
            const item = R.itemAt(state, tx, ty);
            if (!item || item.ground) continue;
            const c = tileCenter(tx, ty);
            shadow(c.x, c.y + 22, 20);
            emoji(item.emoji, c.x, c.y - 2, 46);
        }
    }
    if (v.target) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(v.target.x, v.target.y, 8 + Math.sin(now / 150) * 2, 0, Math.PI * 2); ctx.stroke(); }
    for (const n of v.npcs) { shadow(n.x, n.y + 16, 13); emoji(n.emoji, n.x, n.y + Math.sin(now / 300 + n.x) * 2, 32); }
    shadow(v.hero.x, v.hero.y + 20, 17);
    emoji(R.heroById(state.hero).emoji, v.hero.x, v.hero.y - 2 + Math.sin(now / 220) * 2, 42);
    ctx.restore();
}

// ---------------------------------------------------------------- Dialogs
function gateDialog(biomeId) {
    const b = R.biomeById(biomeId);
    const day = today();
    state = R.withDailyBonus(state, day);
    const open = R.canRun(state, day);
    const bonus = R.isBonus(state, biomeId, day);
    openDialog(
        el('h1', {}, `${b.emoji} ${b.name}`),
        el('ul', {}, b.skills.map(id => el('li', {}, el('span', {}, skillById(id).name), el('span', { 'aria-label': `${R.skillStars(state, id)} étoiles sur ${skillById(id).levels}` }, starLine(R.skillStars(state, id), skillById(id).levels))))),
        bonus && open ? el('p', {}, `✨ Aujourd’hui, les cristaux comptent double ici${NBSP}!`) : null,
        open ? el('p', { class: 'jeu-note' }, `${R.RUN_QUESTIONS} questions. Lance une étoile sur la gribouille qui porte la bonne réponse.`)
            : el('p', {}, `😴 Les gribouilles dorment. Reviens demain${NBSP}! En attendant, tu peux construire ton village.`),
        el('div', { class: 'jeu-actions' },
            open ? cta('▶ Partir', () => { closeDialog(); startRun(biomeId); }, true) : null,
            el('button', { type: 'button', class: 'jeu-cta', 'data-cancel': true, onclick: closeDialog }, open ? 'Pas maintenant' : 'D’accord')),
    );
}

function introDialog() {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    openDialog(
        el('h1', {}, `🏝️ Bienvenue${heroName ? ` ${heroName}` : ''}${NBSP}!`),
        el('p', {}, 'Les gribouilles ont volé les cristaux du savoir et enfermé tes amis.'),
        el('p', {}, 'Passe une porte de l’île, lis la question, puis lance une étoile ⭐ sur la gribouille qui porte la bonne réponse.'),
        el('p', {}, 'Avec les cristaux 💎, construis ton village 🔨 et choisis ton héros 🎭.'),
        el('p', { class: 'jeu-note' }, touch
            ? 'Pour marcher dans le village, touche l’endroit où aller. En expédition, glisse ton pouce à gauche pour bouger et touche une gribouille pour lancer.'
            : 'Pour bouger : les flèches du clavier. Pour lancer une étoile : clique sur une gribouille (ou la barre d’espace).'.replace(/ :/g, `${NBSP}:`)),
        el('div', { class: 'jeu-actions' }, cta(`C’est parti${NBSP}!`, () => { state.seenIntro = true; save(); closeDialog(); }, true)),
    );
}

function parentDialog() {
    const rows = R.BIOMES.flatMap(b => [
        el('tr', {}, el('th', { colspan: '3' }, `${b.emoji} ${b.name}`)),
        ...b.skills.map(id => {
            const s = R.skillState(state, id);
            return el('tr', {}, el('td', {}, skillById(id).name), el('td', {}, `niv. ${s.lvl}/${skillById(id).levels}${s.top ? ' ✔' : ''}`), el('td', {}, s.n ? `${Math.round((100 * s.ok) / s.n)}${NBSP}% (${s.n})` : '—'));
        }),
    ]);
    const select = el('select', { id: 'maxRuns', onchange: (e) => { state.settings.maxRuns = Number(e.target.value); save(); } },
        R.MAX_RUNS_CHOICES.map(n => el('option', { value: String(n), selected: state.settings.maxRuns === n }, n ? String(n) : 'Illimité')));
    openDialog(
        el('h1', {}, '⚙️ Coin des parents'),
        el('p', {}, el('label', { for: 'maxRuns' }, `Expéditions par jour${NBSP}: `), select),
        el('p', { class: 'jeu-note' }, `Aujourd’hui${NBSP}: ${R.runsToday(state, today())} expédition(s). Depuis le début${NBSP}: ${state.runs}. Une expédition = ${R.RUN_QUESTIONS} questions, environ 3 minutes. Construire reste toujours possible.`),
        el('h2', {}, `Progrès (${R.totalStars(state)} étoiles sur ${R.MAX_STARS})`),
        el('p', { class: 'jeu-note' }, `Niveau, puis réussite du premier coup (nombre de questions). ${R.MASTERY} bonnes réponses de suite font monter d’un niveau, ${R.PULLBACK} erreurs de suite font redescendre.`),
        el('table', {}, rows),
        el('div', { class: 'jeu-actions' }, el('button', { type: 'button', class: 'jeu-cta primary', 'data-cancel': true, onclick: closeDialog }, 'Fermer')),
    );
}
holdToActivate($('parentBtn'), parentDialog);

// ---------------------------------------------------------------- Arena
let arena = null;

function buildClock({ h, m }) {
    const NS = 'http://www.w3.org/2000/svg';
    const s = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
    const svg = s('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Une horloge' });
    svg.append(s('circle', { cx: 50, cy: 50, r: 47, fill: '#fff', stroke: '#ffd23f', 'stroke-width': 5 }));
    for (let i = 1; i <= 12; i++) {
        const a = (i * Math.PI) / 6;
        const t = s('text', { x: 50 + Math.sin(a) * 36, y: 50 - Math.cos(a) * 36 + 4.5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: '#1d2433', 'font-family': 'system-ui, sans-serif' });
        t.textContent = String(i);
        svg.append(t);
    }
    const hand = (angle, len, width, color) => s('line', { x1: 50, y1: 50, x2: 50 + Math.sin(angle) * len, y2: 50 - Math.cos(angle) * len, stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' });
    svg.append(hand(((h % 12) + m / 60) * (Math.PI / 6), 20, 5, '#1d2433'), hand(m * (Math.PI / 30), 31, 3, '#e4572e'), s('circle', { cx: 50, cy: 50, r: 3.5, fill: '#1d2433' }));
    return svg;
}

function layoutArena() {
    const top = $('hudArena').getBoundingClientRect().bottom / scale + 6;
    arena.bounds = { x: 8, y: top, w: W - 16, h: Math.max(160, H - top - 8) };
}

function startRun(biomeId) {
    village.mode = 'walk';
    village.selected = null;
    renderTray();
    const bonus = R.isBonus(state, biomeId, today());
    state = R.beginRun(state, today());
    save();
    arena = {
        biome: R.biomeById(biomeId), bonus,
        plan: R.composeExpedition({ state, biomeId, rng: Math.random }), idx: 0, asked: new Set(), results: [], crystals: 0, combo: 0,
        starsWon: [], starsBefore: R.totalStars(state), friendsBefore: R.friends(state).length,
        hero: { x: W / 2, y: H - 80, fx: 0, fy: -1 }, creatures: [], shots: [], gems: [], parts: [], rocks: null, cooldown: 0,
        phase: 'play', wait: 0, bounds: null, q: null, firstTry: true, hinted: false,
    };
    $('hudVillage').hidden = true;
    $('hudArena').hidden = false;
    $('runCrystals').textContent = '💎 0';
    $('combo').hidden = true;
    nextQuestion();
}

function nextQuestion() {
    const a = arena;
    if (a.idx >= a.plan.length) { endRun(true); return; }
    const item = a.plan[a.idx];
    const q = item.q ?? generate(item.skill, R.skillState(state, item.skill).lvl, Math.random, a.asked);
    a.asked.add(q.prompt);
    a.q = q;
    a.firstTry = true;
    a.phase = 'play';
    $('runProgress').textContent = `${a.biome.emoji} ${a.idx + 1} / ${a.plan.length}`;
    $('prompt').textContent = q.prompt;
    $('model').hidden = true;
    $('clock').hidden = !q.clock;
    $('clock').replaceChildren(...(q.clock ? [buildClock(q.clock)] : []));
    layoutArena();
    const b = a.bounds;
    a.hero.x = clamp(a.hero.x, b.x + HERO_R, b.x + b.w - HERO_R);
    a.hero.y = clamp(a.hero.y, b.y + HERO_R, b.y + b.h - HERO_R);
    a.rocks ??= spawnPoints(b.w > 700 ? 3 : 2, b, a.hero, Math.random, 90).map(p => ({ ...p, r: 24 }));
    Object.assign(a.hero, moveInArena(a.hero, 0, 0, HERO_R, b, a.rocks)); // a taller question may have pushed the hero into a rock
    const speed = 26 + 12 * q.level;
    a.creatures = spawnPoints(q.choices.length, b, a.hero, Math.random, 64).map((p, i) => {
        const angle = Math.random() * Math.PI * 2;
        return { ...p, r: 26, label: q.choices[i], right: q.choices[i] === q.answer, state: 'live', vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed, t: 1 + Math.random() * 2, born: 0 };
    });
}

function throwAt(p) {
    const a = arena;
    if (!a || dialogOpen || a.phase !== 'play' || a.cooldown > 0) return;
    // A tap on a gribouille or on its label aims at the gribouille itself.
    let aim = p;
    let best = 46;
    for (const c of a.creatures) {
        const d = Math.min(dist(c, p), dist({ x: c.x, y: c.y - c.r - 22 }, p));
        if (d < best) { best = d; aim = c; }
    }
    const d = toward(a.hero, aim);
    if (!d.x && !d.y) return;
    a.hero.fx = d.x;
    a.hero.fy = d.y;
    a.shots.push({ x: a.hero.x + d.x * 22, y: a.hero.y + d.y * 22, dx: d.x, dy: d.y, travel: 0 });
    a.cooldown = 0.3;
    sfx.throw();
}

function burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2, s = 60 + Math.random() * 200;
        arena.parts.push({ x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s, life: 0.5 + Math.random() * 0.3, max: 0.8, color, r: 3 + Math.random() * 4 });
    }
}
const float = (x, y, text) => arena.parts.push({ x, y, vx: 0, vy: -50, life: 1, max: 1, text });

function resolveHit(c) {
    const a = arena;
    const item = a.plan[a.idx];
    if (!c.right) {
        c.state = 'shield';
        burst(c.x, c.y, '#9aa3b5', 6);
        sfx.bad();
        if (a.firstTry) {
            a.firstTry = false;
            a.combo = 0;
            $('combo').hidden = true;
            if (!item.retry) {
                state = R.recordAnswer(state, item.skill, false).state;
                save();
                a.plan.push({ ...item, retry: true, q: { ...a.q, choices: shuffle(Math.random, a.q.choices) } });
                $('runProgress').textContent = `${a.biome.emoji} ${a.idx + 1} / ${a.plan.length}`;
            }
        }
        // A miss always ends on the model answer: it is written, and the right gribouille glows.
        $('model').textContent = `La bonne réponse${NBSP}: ${a.q.answer}`;
        $('model').hidden = false;
        layoutArena(); // the question bar just grew: nothing may hide under it, least of all the right gribouille
        return;
    }
    const clean = a.firstTry;
    if (clean && !item.retry) {
        const r = R.recordAnswer(state, item.skill, true);
        state = r.state;
        if (r.star) { a.starsWon.push(item.skill); sfx.star(); float(c.x, c.y - 60, '⭐ Nouvelle étoile !'.replace(' !', `${NBSP}!`)); }
        save();
    }
    a.combo = clean ? a.combo + 1 : 0;
    const value = item.retry ? 1 : R.crystalsFor({ clean, combo: a.combo });
    for (let i = 0; i < value; i++) {
        const angle = Math.random() * Math.PI * 2, s = 80 + Math.random() * 120;
        a.gems.push({ x: c.x, y: c.y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s, age: 0 });
    }
    if (clean) { sfx.good(); if (a.combo >= 2) { $('combo').textContent = `🔥 Combo ×${a.combo}`; $('combo').hidden = false; bump($('combo')); } } else sfx.tick();
    a.results.push({ q: a.q, clean, retry: !!item.retry });
    for (const o of a.creatures) burst(o.x, o.y, o === c ? '#ffd23f' : '#ffffff', o === c ? 18 : 6);
    a.creatures = [];
    a.phase = 'between';
    a.wait = 0.8;
}

function updateArena(dt) {
    const a = arena;
    const b = a.bounds;
    a.cooldown -= dt;
    const k = keyDir();
    let dx = k.x + stick.x, dy = k.y + stick.y;
    const n = Math.hypot(dx, dy);
    if (n > 0.15) {
        if (n > 1) { dx /= n; dy /= n; }
        const p = moveInArena(a.hero, dx * 250 * dt, dy * 250 * dt, HERO_R, b, a.rocks);
        a.hero.x = p.x; a.hero.y = p.y;
        const f = Math.hypot(dx, dy);
        a.hero.fx = dx / f; a.hero.fy = dy / f;
    }

    for (const c of a.creatures) {
        c.born = Math.min(1, c.born + dt * 4);
        c.t -= dt;
        const s = c.state === 'shield' ? c.speed * 0.4 : c.speed;
        if (c.t <= 0) { const angle = Math.random() * Math.PI * 2; c.vx = Math.cos(angle) * s; c.vy = Math.sin(angle) * s; c.t = 1.5 + Math.random() * 2.5; }
        let px = 0, py = 0; // keep the labels readable: gribouilles push each other apart
        for (const o of a.creatures) {
            if (o === c) continue;
            const d = dist(c, o);
            if (d < 130 && d > 0.01) { px += ((c.x - o.x) / d) * (130 - d) * 1.2; py += ((c.y - o.y) / d) * (130 - d) * 1.2; }
        }
        const p = moveInArena(c, (c.vx + px) * dt, (c.vy + py) * dt, c.r, { x: b.x, y: b.y + 34, w: b.w, h: b.h - 34 }, a.rocks);
        if (p.hitX) c.vx = -c.vx;
        if (p.hitY) c.vy = -c.vy;
        c.x = p.x; c.y = p.y;
    }

    a.shots = a.shots.filter(s => {
        const step = 640 * dt;
        s.x += s.dx * step; s.y += s.dy * step; s.travel += step;
        if (s.x < b.x || s.x > b.x + b.w || s.y < b.y || s.y > b.y + b.h) return false;
        if (a.rocks.some(r => hits(s, 9, r, r.r))) { burst(s.x, s.y, '#ffd23f', 4); return false; }
        const c = a.phase === 'play' && a.creatures.find(o => hits(s, 10, o, o.r + 4));
        if (c) {
            if (c.state === 'live') resolveHit(c); else burst(s.x, s.y, '#9aa3b5', 3);
            return false;
        }
        if (s.travel > RANGE) {
            burst(s.x, s.y, '#ffd23f', 4);
            if (!a.hinted && a.phase === 'play') { a.hinted = true; tip(`Trop loin${NBSP}! Approche-toi de la gribouille.`); }
            return false;
        }
        return true;
    });

    a.gems = a.gems.filter(g => {
        g.age += dt;
        if (g.age > 0.35) { // a short scatter, then they fly to the hero
            const t = toward(g, a.hero);
            g.x += t.x * 700 * dt; g.y += t.y * 700 * dt;
        } else { g.x += g.vx * dt; g.y += g.vy * dt; }
        g.x = clamp(g.x, b.x + 10, b.x + b.w - 10);
        g.y = clamp(g.y, b.y + 10, b.y + b.h - 10);
        if (dist(g, a.hero) < 24) {
            a.crystals++;
            $('runCrystals').textContent = `💎 ${a.crystals}`;
            bump($('runCrystals'));
            sfx.gem();
            return false;
        }
        return true;
    });

    a.parts = a.parts.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.text) { const k = Math.pow(0.94, dt * 60); p.vx *= k; p.vy *= k; } return p.life > 0; });

    if (a.phase === 'between') {
        a.wait -= dt;
        if (a.wait <= 0 && !a.gems.length) { a.idx++; nextQuestion(); }
    }
}

function drawLabel(c, glow, now) {
    ctx.font = `800 21px ${TEXT}`;
    const w = Math.max(40, ctx.measureText(c.label).width + 22);
    const x = clamp(c.x, w / 2 + 6, W - w / 2 - 6);
    const y = c.y - c.r - 24;
    ctx.fillStyle = c.state === 'shield' ? '#c9cfdb' : '#fff';
    ctx.strokeStyle = glow ? '#ffb703' : '#1d2433';
    ctx.lineWidth = glow ? 4 + Math.sin(now / 120) : 3;
    roundRect(x - w / 2, y - 17, w, 34, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.state === 'shield' ? '#6b7387' : '#1d2433';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.label, x, y + 1);
}

function drawArena(now) {
    const a = arena;
    const b = a.bounds;
    const [g0, g1] = a.biome.ground;
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 80) for (let x = (y / 80) % 2 ? 80 : 0; x < W; x += 160) { ctx.fillStyle = g0; ctx.fillRect(x, y, 80, 80); }
    ctx.strokeStyle = 'rgba(29,36,51,.25)';
    ctx.lineWidth = 3;
    roundRect(b.x, b.y, b.w, b.h, 18);
    ctx.stroke();

    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(29,36,51,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.hero.x, a.hero.y, RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const r of a.rocks) { shadow(r.x, r.y + 20, 22); emoji(a.biome.prop, r.x, r.y - 4, 50); }
    for (const g of a.gems) emoji('💎', g.x, g.y, 20);

    const missed = !a.firstTry;
    for (const c of a.creatures) {
        const glow = missed && c.right;
        if (glow) {
            ctx.strokeStyle = '#ffb703';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r + 9 + Math.sin(now / 120) * 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        shadow(c.x, c.y + c.r - 2, 20);
        emoji(a.biome.creature, c.x, c.y + Math.sin(now / 260 + c.x) * 3, 46 * c.born, c.state === 'shield' ? 0.35 : 1);
    }
    for (const c of a.creatures) drawLabel(c, missed && c.right, now);

    for (const s of a.shots) emoji('⭐', s.x, s.y, 22);

    ctx.fillStyle = 'rgba(29,36,51,.55)';
    ctx.beginPath();
    ctx.arc(a.hero.x + a.hero.fx * 30, a.hero.y + a.hero.fy * 30, 5, 0, Math.PI * 2);
    ctx.fill();
    shadow(a.hero.x, a.hero.y + 20, 17);
    emoji(R.heroById(state.hero).emoji, a.hero.x, a.hero.y - 2, 42);

    for (const p of a.parts) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        if (p.text) {
            ctx.font = `800 22px ${TEXT}`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#1d2433';
            ctx.strokeText(p.text, clamp(p.x, 120, W - 120), p.y);
            ctx.fillStyle = '#ffd23f';
            ctx.fillText(p.text, clamp(p.x, 120, W - 120), p.y);
        } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    if (stick.id !== null) {
        const ox = stick.ox / scale, oy = stick.oy / scale, r = STICK_R / scale;
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(ox + stick.x * r, oy + stick.y * r, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
}

function leaveArena() {
    arena = null;
    stick.id = null;
    $('hudArena').hidden = true;
    $('hudVillage').hidden = false;
    village.target = null;
    syncFriends();
    hud();
}

// `finished`: all questions answered (run bonus). Otherwise the child went home early and keeps the crystals
// already picked up; either way the expedition was counted for the day when it started.
function endRun(finished) {
    const a = arena;
    const first = a.results.filter(r => !r.retry);
    const { state: next, earned } = R.finishRun(state, { biomeId: a.biome.id, crystals: a.crystals, bonus: a.bonus, finished }, today());
    state = next;
    save();
    const total = R.totalStars(state);
    const newItems = R.CATALOG.filter(i => i.stars > a.starsBefore && i.stars <= total);
    const newFriend = R.friends(state).length > a.friendsBefore ? a.biome.friend : null;
    const misses = [...new Map(first.filter(r => !r.clean).map(r => [r.q.prompt, r.q])).values()];
    leaveArena();
    if (finished && (a.starsWon.length || newFriend)) sfx.star();
    openDialog(
        el('h1', {}, finished ? `Expédition finie${NBSP}!` : 'Retour au village'),
        el('p', { class: 'jeu-big', 'aria-label': `${first.filter(r => r.clean).length} réponses du premier coup` }, '⭐'.repeat(first.filter(r => r.clean).length) || '🏝️'),
        el('p', { class: 'jeu-big' }, `+ ${earned} 💎`),
        finished && a.bonus ? el('p', {}, `✨ Cristaux doublés${NBSP}: c’était la porte du jour${NBSP}!`) : null,
        a.starsWon.length ? el('ul', {}, a.starsWon.map(id => el('li', {}, el('span', {}, `Nouvelle étoile${NBSP}: ${skillById(id).name}`), el('span', {}, '⭐')))) : null,
        newFriend ? el('p', {}, `${newFriend} est libre${NBSP}! Ton nouvel ami s’installe au village.`) : null,
        newItems.length ? el('p', {}, `🔨 Nouveau à construire${NBSP}: ${newItems.map(i => i.emoji ?? i.name).join(' ')}`) : null,
        misses.length ? [el('h2', {}, `À retenir${NBSP}:`), el('ul', {}, misses.map(q => el('li', { class: 'miss' }, q.prompt, el('b', {}, `✅ ${q.answer}`))))] : null,
        el('div', { class: 'jeu-actions' }, cta('🏝️ Au village', closeDialog, true)),
    );
}

$('quitBtn').addEventListener('click', () => {
    if (!arena || dialogOpen) return;
    openDialog(
        el('h1', {}, `Rentrer au village${NBSP}?`),
        el('p', {}, 'Tu gardes les cristaux déjà ramassés.'),
        el('div', { class: 'jeu-actions' },
            el('button', { type: 'button', class: 'jeu-cta primary', 'data-cancel': true, onclick: closeDialog }, 'Continuer'),
            cta('🏝️ Rentrer', () => { closeDialog(); endRun(false); })),
    );
});

// ---------------------------------------------------------------- Loop
let last = performance.now();
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dialogOpen) { if (arena) updateArena(dt); else updateVillage(dt); }
    const zoom = dpr * (arena ? scale : vscale);
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    if (arena) drawArena(now); else drawVillage(now);
    requestAnimationFrame(frame);
}

// jeu.html?debug: a handle for hand-testing from the console (read the arena, throw at a creature, step the
// simulation when the tab is in the background and requestAnimationFrame sleeps).
if (new URLSearchParams(location.search).has('debug')) window.jeu = { get arena() { return arena; }, get state() { return state; }, throwAt, village, tick: (dt) => { if (!dialogOpen) { if (arena) updateArena(dt); else updateVillage(dt); } } };

resize();
followHero();
syncFriends();
hud();
renderTray();
if (!state.seenIntro) introDialog();
requestAnimationFrame(frame);
