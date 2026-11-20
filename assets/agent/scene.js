// assets/agent/scene.js
// Draws Agent L with three.js: the island or a mission room, the agent, robots and their vision cones, beacons,
// chips, doors, crates and labels. It never decides anything: app.js hands it positions and states (update(view)).
// Everything is built from primitives (flat-shaded boxes, cylinders, cones), instanced where there are many; signs
// and labels are canvas textures drawn here. No model, texture or font file.
import * as THREE from '../vendor/three/three.module.js';
import { TILE } from './levels.js';
import { solidsOf, cellCenter, ROBOT } from './world.js';

const SKY = 0x9fd3f2;
const ROOM_SKY = 0x1c2436;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const TEXT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const BEACON_COLORS = { priority: 0xffc93c, play: 0x37d67a, rest: 0x7f8fa6, cap: 0xe05d5d };
const ROBOT_COLORS = { patrol: 0x7fd1ff, alert: 0xffb03b, chase: 0xff4d4d, frozen: 0x9ab8ff };

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

// A text (and optional emoji) on a canvas: signs on walls and floating labels.
function textCanvas(lines, { bg = 'rgba(16, 22, 38, 0.82)', fg = '#ffffff', size = 56, pad = 22, border = null } = {}) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = (l) => `${l.bold === false ? 600 : 800} ${l.size ?? size}px ${l.emoji ? EMOJI_FONT : TEXT_FONT}`;
    const items = lines.filter(l => l && l.text);
    let w = 0, h = pad;
    for (const l of items) { ctx.font = font(l); w = Math.max(w, ctx.measureText(l.text).width); h += (l.size ?? size) * 1.18; }
    c.width = Math.ceil(Math.min(1024, w + pad * 2));
    c.height = Math.ceil(h + pad * 0.6);
    if (bg) {
        ctx.fillStyle = bg;
        const r = 18;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(0, 0, c.width, c.height, r) : ctx.rect(0, 0, c.width, c.height);
        ctx.fill();
        if (border) { ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.stroke(); }
    }
    let y = pad;
    for (const l of items) {
        ctx.font = font(l);
        ctx.fillStyle = l.color ?? fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(l.text, c.width / 2, y, c.width - pad);
        y += (l.size ?? size) * 1.18;
    }
    return c;
}

function canvasTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

// A floating label that always faces the camera; height in metres.
function label(lines, height = 0.9, opts = {}) {
    const canvas = textCanvas(lines, opts);
    const mat = new THREE.SpriteMaterial({ map: canvasTexture(canvas), depthTest: opts.depthTest ?? true, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.set((height * canvas.width) / canvas.height, height, 1);
    s.renderOrder = 2;
    return s;
}

// A flat sign on a wall, facing +z.
function sign(text, width) {
    const canvas = textCanvas([{ text, size: 72 }], { bg: '#f7f3e3', fg: '#1d2433', border: '#1d2433' });
    const h = (width * canvas.height) / canvas.width;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas) }));
    return mesh;
}

function disposeTree(obj) {
    obj.traverse(o => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
    });
}

// Many boxes of one kind in one draw call; colors per instance.
function boxes(list, { color = 0xffffff, colorOf = null, material = null } = {}) {
    if (!list.length) return null;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, material ?? lambert(0xffffff), list.length);
    const m = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((b, i) => {
        m.position.set(b.x, b.y ?? 0, b.z);
        m.scale.set(b.w, b.h, b.d);
        m.updateMatrix();
        mesh.setMatrixAt(i, m.matrix);
        mesh.setColorAt(i, c.set(colorOf ? colorOf(b) : (b.color ?? color)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
}

// The agent: boxes, a visor and a backpack; legs and arms swing while he walks.
function buildAgent() {
    const g = new THREE.Group();
    const mats = { suit: lambert(0x2b3a55), trim: lambert(0xf2b134), visor: lambert(0x7fd1ff, { emissive: 0x1b4a66 }), skin: lambert(0xf1c9a5) };
    const part = (w, h, d, mat, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        g.add(mesh);
        return mesh;
    };
    const leg = (x) => { const p = new THREE.Group(); p.position.set(x, 0.8, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.26), mats.suit); m.position.y = -0.4; p.add(m); g.add(p); return p; };
    const arm = (x) => { const p = new THREE.Group(); p.position.set(x, 1.42, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), mats.suit); m.position.y = -0.3; p.add(m); g.add(p); return p; };
    const legs = [leg(-0.14), leg(0.14)];
    const arms = [arm(-0.38), arm(0.38)];
    part(0.58, 0.66, 0.34, mats.suit, 0, 1.15, 0);
    part(0.6, 0.1, 0.36, mats.trim, 0, 0.88, 0);
    part(0.42, 0.42, 0.4, mats.skin, 0, 1.7, 0);
    part(0.44, 0.14, 0.12, mats.visor, 0, 1.74, 0.17);
    part(0.46, 0.12, 0.44, mats.suit, 0, 1.94, 0);
    part(0.4, 0.46, 0.18, mats.trim, 0, 1.18, -0.26);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.3), lambert(0x2ef2ff, { emissive: 0x0b5560 }));
    board.position.y = 0.04;
    board.visible = false;
    g.add(board);
    return { group: g, shadow, legs, arms, mats, board, phase: 0 };
}

function buildRobot() {
    const g = new THREE.Group();
    const bodyMat = lambert(0xc9d1dc);
    const eyeMat = new THREE.MeshBasicMaterial({ color: ROBOT_COLORS.patrol });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 8), bodyMat);
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.56), bodyMat);
    head.position.y = 1.4;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.06), eyeMat);
    eye.position.set(0, 1.42, 0.29);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10), lambert(0x3a4256));
    wheel.position.y = 0.17;
    const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), eyeMat);
    antenna.position.y = 1.8;
    g.add(body, head, eye, wheel, antenna);
    const half = (ROBOT.fov * Math.PI) / 360;
    const coneMat = new THREE.MeshBasicMaterial({ color: ROBOT_COLORS.patrol, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.CircleGeometry(ROBOT.range, 20, -half, 2 * half), coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.y = 0.03;
    const coneHolder = new THREE.Group();
    coneHolder.add(cone);
    return { group: g, eyeMat, coneMat, cone: coneHolder };
}

export function createScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6b4a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-40, 80, 30);
    scene.add(sun);

    const agent = buildAgent();
    scene.add(agent.group, agent.shadow);

    let world = null;          // the island or the room
    let mode = 'island';
    const robotPool = [];
    const beaconMeshes = new Map(); // lessonId → { group, pillar, gem, label, state }
    const chipMeshes = new Map();
    const doorMeshes = new Map();  // lock index → mesh
    let zoneMeshes = [];
    let crate = null;              // { group, labelSprite, key }
    let exitPad = null;
    let dispenser = null;
    const cam = { x: 0, y: 5, z: 10, ready: false };
    let lastT = performance.now();
    let frames = 0, fpsT = performance.now(), fps = 60;

    function clearWorld() {
        if (world) { scene.remove(world); disposeTree(world); }
        world = new THREE.Group();
        scene.add(world);
        beaconMeshes.clear(); chipMeshes.clear(); doorMeshes.clear(); zoneMeshes = [];
        for (const r of robotPool) { scene.remove(r.group, r.cone); }
        robotPool.length = 0;
        crate = null; exitPad = null; dispenser = null;
        cam.ready = false;
    }

    function showIsland(island, beacons = [], chips = []) {
        clearWorld();
        mode = 'island';
        scene.background = new THREE.Color(SKY);
        scene.fog = new THREE.Fog(SKY, 70, 260);
        const ground = new THREE.Mesh(new THREE.BoxGeometry(island.size, 2, island.size), lambert(0x7cc56b));
        ground.position.y = -1;
        const sand = new THREE.Mesh(new THREE.BoxGeometry(island.size + 16, 2, island.size + 16), lambert(0xf0dca0));
        sand.position.y = -1.15;
        const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), lambert(0x3a8fd6));
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.6;
        world.add(ground, sand, water);
        // Roads: from the harbour to the academy, the market and the square.
        const roads = [
            { x: 0, z: 40, w: 8, d: 150 }, { x: -40, z: -60, w: 110, d: 8 }, { x: 45, z: -50, w: 110, d: 8 },
            { x: 0, z: 104, w: 120, d: 8 }, { x: -60, z: 10, w: 8, d: 60 }, { x: 60, z: 10, w: 8, d: 60 },
        ];
        const roadMesh = boxes(roads.map(r => ({ ...r, y: -0.98, h: 1 })), { color: 0xd9d2c3 });
        world.add(roadMesh);
        const bodies = island.solids.filter(b => b.kind !== 'tree');
        world.add(boxes(bodies, { colorOf: (b) => b.color ?? (b.kind === 'crate' ? 0xb07a43 : 0xcfd6e0) }));
        const roofs = bodies.filter(b => ['building', 'hideout'].includes(b.kind)).map(b => ({ x: b.x, z: b.z, y: b.h, w: b.w + 0.6, d: b.d + 0.6, h: 0.35, color: 0x3d405b }));
        world.add(boxes(roofs, { color: 0x3d405b }));
        const trees = island.solids.filter(b => b.kind === 'tree');
        if (trees.length) {
            world.add(boxes(trees.map(t => ({ ...t, w: 0.5, d: 0.5, h: 2.2 })), { color: 0x7a5230 }));
            const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 3.6, 7), lambert(0x2f8f46), trees.length * 2);
            const m = new THREE.Object3D();
            trees.forEach((t, i) => {
                m.position.set(t.x, 3.2, t.z); m.scale.set(1, 1, 1); m.updateMatrix(); crowns.setMatrixAt(i * 2, m.matrix);
                m.position.set(t.x, 4.6, t.z); m.scale.set(0.75, 0.8, 0.75); m.updateMatrix(); crowns.setMatrixAt(i * 2 + 1, m.matrix);
            });
            world.add(crowns);
        }
        for (const b of bodies.filter(x => x.sign)) {
            const s = sign(b.sign, Math.min(b.w * 0.8, 3 + b.sign.length * 0.55));
            s.position.set(b.x, Math.min(b.h - 0.9, 3.6), b.z + b.d / 2 + 0.06);
            world.add(s);
        }
        // The hideout's door glows.
        const hd = island.solids.find(b => b.kind === 'hideout');
        if (hd) {
            const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
            door.position.set(hd.x, 1.1, hd.z + hd.d / 2 + 0.06);
            world.add(door);
        }
        for (const bc of beacons) addBeacon(bc);
        for (const c of chips) {
            const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x2ef2ff }));
            mesh.position.set(c.x, c.y + 0.8, c.z);
            world.add(mesh);
            chipMeshes.set(c.id, mesh);
        }
    }

    function addBeacon(bc) {
        const g = new THREE.Group();
        g.position.set(bc.x, 0, bc.z);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.2, 16), lambert(0x2b2d42));
        pad.position.y = 0.1;
        const pillarMat = new THREE.MeshBasicMaterial({ color: BEACON_COLORS.play, transparent: true, opacity: 0.35, depthWrite: false });
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 16, 1, true), pillarMat);
        pillar.position.y = 3.2;
        const gemMat = new THREE.MeshBasicMaterial({ color: BEACON_COLORS.play });
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), gemMat);
        gem.position.y = 2.2;
        g.add(pad, pillar, gem);
        world.add(g);
        beaconMeshes.set(bc.lessonId, { group: g, pillarMat, gemMat, gem, label: null, key: null });
    }

    // Beacon look: state (priority / play / rest / cap) and its floating lines.
    function setBeacon(lessonId, { state, lines }) {
        const b = beaconMeshes.get(lessonId);
        if (!b) return;
        const key = `${state}|${lines.map(l => l.text).join('|')}`;
        if (b.key === key) return;
        b.key = key;
        b.pillarMat.color.set(BEACON_COLORS[state]);
        b.gemMat.color.set(BEACON_COLORS[state]);
        if (b.label) { b.group.remove(b.label); disposeTree(b.label); }
        b.label = label(lines, 1.3);
        b.label.position.y = 4.1;
        b.group.add(b.label);
    }

    function showRoom(parsed, type) {
        clearWorld();
        mode = 'room';
        scene.background = new THREE.Color(ROOM_SKY);
        scene.fog = new THREE.Fog(ROOM_SKY, 30, 90);
        const W = parsed.w * TILE, H = parsed.h * TILE;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), lambert(type === 'sort' ? 0x5c6b73 : 0x4a5568));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(W / 2, 0, H / 2);
        const grid = new THREE.GridHelper(Math.max(W, H), Math.max(parsed.w, parsed.h), 0x6b7a90, 0x6b7a90);
        grid.position.set(Math.max(W, H) / 2, 0.01, Math.max(W, H) / 2);
        grid.material.transparent = true; grid.material.opacity = 0.25;
        const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lambert(0x111827));
        outside.rotation.x = -Math.PI / 2;
        outside.position.set(W / 2, -0.05, H / 2);
        world.add(outside, floor, grid);
        const solids = solidsOf(parsed);
        world.add(boxes(solids.filter(s => s.kind === 'wall'), { color: type === 'sort' ? 0x8d99ae : 0x6c7a96 }));
        const crates = solids.filter(s => s.kind === 'crate').map(s => ({ ...s, w: TILE * 0.85, d: TILE * 0.85 }));
        world.add(boxes(crates, { color: 0xb07a43 }));
        for (const s of solids.filter(x => x.kind === 'door')) {
            const n = Number(parsed.at(s.cx, s.cy));
            const g = new THREE.Group();
            g.position.set(s.x, 0, s.z);
            // A door in a horizontal wall (walls left and right) spans x; in a vertical wall it spans z.
            const horizontalWall = parsed.solid(s.cx - 1, s.cy) && parsed.solid(s.cx + 1, s.cy);
            const slab = new THREE.Mesh(new THREE.BoxGeometry(horizontalWall ? TILE : 0.4, 3, horizontalWall ? 0.4 : TILE),
                lambert(0xd64545, { emissive: 0x330000 }));
            slab.position.y = 1.5;
            const num = label([{ text: `🔒 ${n + 1}`, size: 56 }], 0.8);
            num.position.y = 3.6;
            g.add(slab, num);
            world.add(g);
            doorMeshes.set(n, { group: g, slab, num, open: 0 });
        }
        if (parsed.exit) {
            const c = cellCenter(parsed.exit);
            exitPad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), new THREE.MeshBasicMaterial({ color: 0x37d67a, transparent: true, opacity: 0.85 }));
            exitPad.position.set(c.x, 0.06, c.z);
            const t = label([{ text: 'EXIT', size: 60 }], 0.7);
            t.position.set(c.x, 2.2, c.z);
            world.add(exitPad, t);
        }
        if (parsed.dispenser) {
            const c = cellCenter(parsed.dispenser);
            dispenser = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), lambert(0x2a9d8f, { emissive: 0x0b2e2a }));
            dispenser.position.set(c.x, 0.6, c.z);
            const t = label([{ text: '📦', size: 64, emoji: true }], 0.8, { bg: null });
            t.position.set(c.x, 1.8, c.z);
            world.add(dispenser, t);
        }
    }

    // Sort zones: [{ tiles, color, lines, closed, lit }].
    function setZones(zones) {
        for (const z of zoneMeshes) { world.remove(z); disposeTree(z); }
        zoneMeshes = [];
        for (const z of zones) {
            const g = new THREE.Group();
            const mat = new THREE.MeshBasicMaterial({ color: z.closed ? 0x2b2d42 : z.color, transparent: true, opacity: z.closed ? 0.6 : z.lit ? 0.95 : 0.6 });
            for (const t of z.tiles) {
                const c = cellCenter(t);
                const tile = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.96, 0.06, TILE * 0.96), mat);
                tile.position.set(c.x, 0.03, c.z);
                g.add(tile);
            }
            const cx = z.tiles.reduce((s, t) => s + cellCenter(t).x, 0) / z.tiles.length;
            const cz = z.tiles.reduce((s, t) => s + cellCenter(t).z, 0) / z.tiles.length;
            if (z.closed) {
                const fence = boxes(z.fence ?? [], { color: 0x3d405b });
                if (fence) g.add(fence);
            } else if (z.lines) {
                const l = label(z.lines, 1.4, { border: z.lit ? '#ffd166' : null });
                l.position.set(cx, 2.6, cz);
                g.add(l);
            }
            world.add(g);
            zoneMeshes.push(g);
        }
    }

    // The crate of the current sort lock: carried, waiting at the dispenser, or none.
    function setCrate(c) {
        const key = c ? `${c.text}|${c.emoji}` : null;
        if (crate && crate.key !== key) { world.remove(crate.group); disposeTree(crate.group); crate = null; }
        if (!c) return;
        if (!crate) {
            const g = new THREE.Group();
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), lambert(0xd4a373));
            const l = label([{ text: c.emoji, size: 64, emoji: true }, { text: c.text, size: 46 }], 1.1);
            l.position.y = 1.2;
            g.add(box, l);
            world.add(g);
            crate = { group: g, key };
        }
    }

    function syncRobots(robots) {
        while (robotPool.length < robots.length) { const r = buildRobot(); scene.add(r.group, r.cone); robotPool.push(r); }
        robotPool.forEach((r, i) => {
            const data = robots[i];
            r.group.visible = r.cone.visible = !!data;
            if (!data) return;
            r.group.position.set(data.x, 0, data.z);
            r.group.rotation.y = Math.PI / 2 - data.dir;
            r.cone.position.set(data.x, 0, data.z);
            r.cone.rotation.y = -data.dir;
            const color = ROBOT_COLORS[data.frozenS > 0 ? 'frozen' : data.mode] ?? ROBOT_COLORS.patrol;
            r.eyeMat.color.set(color);
            r.coneMat.color.set(color);
            r.coneMat.opacity = data.frozenS > 0 ? 0.08 : data.mode === 'chase' ? 0.32 : 0.2;
        });
    }

    function update(view) {
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastT) / 1000);
        lastT = now;
        frames++;
        if (now - fpsT >= 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
        const p = view.player;
        agent.group.position.set(p.x, p.y, p.z);
        agent.group.rotation.y = view.face ?? 0;
        agent.shadow.position.set(p.x, (view.groundY ?? 0) + 0.02, p.z);
        agent.board.visible = !!view.board;
        agent.phase += dt * (view.moving ? 10 * (view.speedFactor ?? 1) : 0);
        const swing = view.moving && !view.board ? Math.sin(agent.phase) * 0.6 : 0;
        agent.legs[0].rotation.x = swing; agent.legs[1].rotation.x = -swing;
        agent.arms[0].rotation.x = -swing * 0.8; agent.arms[1].rotation.x = swing * 0.8;
        if (view.robots) syncRobots(view.robots);
        for (const [n, d] of doorMeshes) {
            const want = view.openDoors?.has(n) ? 1 : 0;
            d.open += (want - d.open) * Math.min(1, dt * 6);
            d.slab.position.y = 1.5 - d.open * 3.1;
            d.num.visible = d.open < 0.5;
            const next = view.nextDoor === n;
            d.slab.material.emissive.setHex(next ? 0x6b4f00 : 0x330000);
            d.slab.material.color.setHex(next ? 0xffc93c : 0xd64545);
        }
        if (exitPad) exitPad.material.color.setHex(view.exitOpen ? 0x37d67a : 0x555b6e);
        if (crate && view.crate) {
            crate.group.position.set(view.crate.x, view.crate.y, view.crate.z);
            crate.group.rotation.y += dt;
        }
        for (const [id, mesh] of chipMeshes) {
            mesh.visible = !view.chips?.has(id);
            mesh.rotation.y += dt * 2;
        }
        for (const b of beaconMeshes.values()) { b.gem.rotation.y += dt * 1.5; b.gem.position.y = 2.2 + Math.sin(now / 400) * 0.15; }
        // Camera: behind the agent (yaw), higher and steeper in a room so the walls do not hide him.
        const dist = mode === 'room' ? 8.5 : 7.5, height = mode === 'room' ? 10.5 : 3.6;
        const tx = p.x + Math.sin(view.yaw) * dist, tz = p.z + Math.cos(view.yaw) * dist, ty = p.y + height;
        const k = cam.ready ? Math.min(1, dt * 8) : 1;
        cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
        cam.ready = true;
        camera.position.set(cam.x, cam.y, cam.z);
        camera.lookAt(p.x, p.y + (mode === 'room' ? 0.6 : 1.4), p.z);
        renderer.render(scene, camera);
    }

    function resize() {
        const w = canvas.clientWidth || globalThis.innerWidth, h = canvas.clientHeight || globalThis.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function setOutfit(colors) {
        if (!colors) return;
        agent.mats.suit.color.setHex(colors[0]);
        agent.mats.trim.color.setHex(colors[1]);
        agent.mats.visor.color.setHex(colors[2]);
    }

    resize();
    return {
        showIsland, showRoom, setBeacon, setZones, setCrate, setOutfit, update, resize,
        setQuality: (pr) => { renderer.setPixelRatio(pr); resize(); },
        pixelRatio: () => renderer.getPixelRatio(),
        info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps: Math.round(fps) }),
        dispose: () => { clearWorld(); disposeTree(scene); renderer.dispose(); },
    };
}
