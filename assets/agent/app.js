// assets/agent/app.js
// Agent L (agent.html): the page. A state machine boot → hub → briefing → mission → debrief → hub, a fixed 1/60 s
// simulation step and one render per animation frame, paused while the page is hidden. Decisions come from the pure
// modules (rules, missions, world, levels); scene.js draws, input.js listens, ui.js / locks.js / sound.js speak to
// the child. `agent.html?debug` exposes window.agent for hand-testing.
import { ISLAND } from './levels.js';
import { PLAYER, stepPlayer, groundAt } from './world.js';
import { createScene } from './scene.js';
import { createInput } from './input.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- page state
const app = {
    screen: 'boot',          // boot | hub | mission
    paused: false,
    player: { x: ISLAND.spawn.x, y: 0, z: ISLAND.spawn.z, vy: 0, grounded: true },
    face: Math.PI,
    yaw: 0,
    moving: false,
    speedFactor: 1,
};

// ---------------------------------------------------------------- 3D
let scene = null;
try {
    scene = createScene($('view'));
} catch (err) {
    console.error('[agent] WebGL unavailable', err);
}

function fatal(text) {
    $('startNote').replaceChildren(text, ' ', Object.assign(document.createElement('a'), { href: 'en.html', textContent: 'Réviser sur la page d’anglais' }));
    $('playBtn').hidden = true;
}

const input = createInput($('view'), {
    stick: $('stick'),
    buttons: { action: $('btnAction'), jump: $('btnJump'), sprint: $('btnSprint'), gadget: $('btnGadget') },
});

function showWorld() {
    scene.showIsland(ISLAND, [], []);
}

// ---------------------------------------------------------------- simulation
const HALF = ISLAND.size / 2 - 3;

function moveOnIsland(inp, dt) {
    // The stick is in screen terms; turn it by the camera yaw (the camera looks along (-sin yaw, -cos yaw)).
    const s = Math.sin(app.yaw), c = Math.cos(app.yaw);
    const mx = inp.dx * c - inp.dz * s, mz = -inp.dx * s - inp.dz * c;
    const speed = (inp.sprint ? PLAYER.sprint : PLAYER.speed) * app.speedFactor;
    const p = stepPlayer(app.player, { dx: mx, dz: mz, jump: inp.jump, speed }, dt, ISLAND.solids);
    p.x = Math.max(-HALF, Math.min(HALF, p.x));
    p.z = Math.max(-HALF, Math.min(HALF, p.z));
    app.moving = Math.hypot(mx, mz) > 0.05;
    if (app.moving) app.face = Math.atan2(mx, mz);
    app.player = p;
}

function tick(dt, inp) {
    app.yaw += inp.yawDelta;
    if (app.screen === 'hub') moveOnIsland(inp, dt);
}

function view() {
    return {
        player: app.player, face: app.face, yaw: app.yaw, moving: app.moving, speedFactor: app.speedFactor,
        groundY: groundAt(app.player.x, app.player.z, app.player.y, ISLAND.solids),
    };
}

// ---------------------------------------------------------------- loop and quality
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
    if (app.screen === 'boot' || !scene) return;
    if (!app.paused && !document.hidden) {
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

document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });
globalThis.addEventListener('resize', () => scene?.resize());
globalThis.visualViewport?.addEventListener('resize', () => scene?.resize());

$('view').addEventListener('webglcontextlost', (e) => { e.preventDefault(); app.paused = true; toast('Affichage interrompu… un instant.'); });
$('view').addEventListener('webglcontextrestored', () => { showWorld(); app.paused = false; toast(''); });

let toastTimer = null;
function toast(text, ms = 2600) {
    const t = $('toast');
    clearTimeout(toastTimer);
    t.textContent = text;
    t.hidden = !text;
    if (text && ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- boot
function enterHub() {
    app.screen = 'hub';
    $('hud').hidden = false;
    $('controls').hidden = false;
    showWorld();
}

if (!scene) {
    fatal('Cet appareil ne peut pas afficher la 3D (WebGL).');
} else {
    $('startNote').textContent = 'Récupère les bâtiments de l’île, une serrure à la fois.';
    $('playBtn').disabled = false;
    $('playBtn').addEventListener('click', () => {
        $('start').hidden = true;
        enterHub();
    });
    requestAnimationFrame(frame);
}

if (DEBUG) {
    globalThis.agent = {
        get state() { return app; },
        teleport(x, z) { app.player = { ...app.player, x, z, y: groundAt(x, z, 99, ISLAND.solids), vy: 0 }; },
        tick(dt = STEP, inp = {}) {
            const n = Math.max(1, Math.round(dt / STEP));
            for (let i = 0; i < n; i++) tick(STEP, { dx: 0, dz: 0, yawDelta: 0, ...inp });
            scene.update(view());
            return { ...app.player };
        },
        info: () => scene.info(),
    };
}
