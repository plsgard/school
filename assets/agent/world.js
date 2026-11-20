// assets/agent/world.js
// Pure physics and sight, in metres and seconds: the agent walks, slides along boxes, climbs low steps, jumps and
// falls; robots patrol, notice him after a moment in their vision cone, chase, and give up. A box is
// { x, z, w, d, h, y? } (centre, sizes, height from its base y, 0 by default). Nothing here draws.
import { TILE } from './levels.js';

export const PLAYER = { radius: 0.4, speed: 5, sprint: 8, boardFactor: 1.6, jump: 1.4, step: 0.35, height: 1.8 };
export const ROBOT = { patrol: 2.5, chase: 4.5, range: 9, fov: 70, catchDist: 0.9, noticeS: 0.6, giveUpS: 3, radius: 0.45, turn: 5 };
const GRAVITY = 22;
const JUMP_V = Math.sqrt(2 * GRAVITY * PLAYER.jump);

const overlaps = (x, z, r, bx) => {
    const cx = Math.max(bx.x - bx.w / 2, Math.min(x, bx.x + bx.w / 2));
    const cz = Math.max(bx.z - bx.d / 2, Math.min(z, bx.z + bx.d / 2));
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
};
const top = (bx) => (bx.y ?? 0) + bx.h;

// A box blocks a body standing at height y when it is more than a step above its feet and not above its head.
const blocks = (bx, y, step) => top(bx) - y > step && (bx.y ?? 0) < y + PLAYER.height;

function blocked(x, z, y, r, solids, step) {
    for (const bx of solids) if (overlaps(x, z, r, bx) && blocks(bx, y, step)) return true;
    return false;
}

// The highest top under a body at (x, z) that it can stand on from height y.
export function groundAt(x, z, y, solids, r = PLAYER.radius, step = PLAYER.step) {
    let g = 0;
    for (const bx of solids) if (overlaps(x, z, r, bx) && top(bx) <= y + step && top(bx) > g) g = top(bx);
    return g;
}

// Moves along x then z, so a body slides along a wall instead of stopping dead.
export function slide(pos, dx, dz, solids, { r = PLAYER.radius, y = 0, step = PLAYER.step } = {}) {
    let { x, z } = pos;
    if (dx && !blocked(x + dx, z, y, r, solids, step)) x += dx;
    if (dz && !blocked(x, z + dz, y, r, solids, step)) z += dz;
    return { x, z };
}

// input: { dx, dz } a direction of length ≤ 1 (already turned to the camera), jump, speed (m/s).
export function stepPlayer(player, input, dt, solids) {
    const speed = input.speed ?? PLAYER.speed;
    const { x, z } = slide(player, (input.dx ?? 0) * speed * dt, (input.dz ?? 0) * speed * dt, solids, { y: player.y });
    let vy = player.vy ?? 0;
    let grounded = !!player.grounded;
    if (input.jump && grounded) { vy = JUMP_V; grounded = false; }
    vy -= GRAVITY * dt;
    let y = player.y + vy * dt;
    const g = groundAt(x, z, Math.max(y, player.y), solids);
    if (y <= g) { y = g; vy = 0; grounded = true; } else grounded = false;
    return { ...player, x, y, z, vy, grounded };
}

// Walls and crates of a mission room as boxes, plus the lock doors still closed. Cell (cx, cy) has its centre at
// ((cx + 0.5) · TILE, (cy + 0.5) · TILE).
export function solidsOf(parsed, openLocks = new Set()) {
    const out = [];
    for (let y = 0; y < parsed.h; y++) {
        for (let x = 0; x < parsed.w; x++) {
            const ch = parsed.at(x, y);
            const box = (h, kind) => out.push({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE, w: TILE, d: TILE, h, kind, cx: x, cy: y });
            if (ch === '#') box(3, 'wall');
            else if (ch === 'c') box(1, 'crate');
            else if (ch >= '0' && ch <= '9' && !openLocks.has(Number(ch))) box(3, 'door');
        }
    }
    return out;
}

export const cellCenter = ({ x, y }) => ({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE });
export const cellOf = (x, z) => ({ x: Math.floor(x / TILE), y: Math.floor(z / TILE) });

// A closed door blocks sight like a wall.
export const opaqueWith = (parsed, openLocks = new Set()) => (x, y) => {
    const ch = parsed.at(x, y);
    return parsed.opaque(x, y) || (ch >= '0' && ch <= '9' && !openLocks.has(Number(ch)));
};

const angleTo = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The robot looks along dir (radians; 0 = +x, π/2 = +z): within range, inside the cone, nothing opaque between.
export function sees(robot, target, opaque, tile = TILE) {
    const dx = target.x - robot.x, dz = target.z - robot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > ROBOT.range) return false;
    if (dist > 0.01 && Math.abs(wrap(Math.atan2(dz, dx) - robot.dir)) > (ROBOT.fov * Math.PI) / 360) return false;
    const n = Math.ceil(dist / (tile / 4));
    for (let i = 1; i < n; i++) {
        const px = robot.x + (dx * i) / n, pz = robot.z + (dz * i) / n;
        if (opaque(Math.floor(px / tile), Math.floor(pz / tile))) return false;
    }
    return true;
}

// A robot on a patrol path given in cells.
export function createRobot(path, id = 0) {
    const pts = path.map(([x, y]) => cellCenter({ x, y }));
    const next = pts[1 % pts.length];
    return { id, x: pts[0].x, z: pts[0].z, dir: angleTo(pts[0], next), path: pts, wp: 1 % pts.length, mode: 'patrol',
        seenS: 0, lostS: 0, frozenS: 0, lastSeen: null };
}

const turnTo = (dir, want, dt) => {
    const d = wrap(want - dir);
    const max = ROBOT.turn * dt;
    return Math.abs(d) <= max ? want : dir + Math.sign(d) * max;
};

const solidsCache = new WeakMap();
function cachedSolids(parsed, openLocks) {
    const key = [...openLocks].sort().join(',');
    let entry = solidsCache.get(parsed);
    if (!entry || entry.key !== key) { entry = { key, solids: solidsOf(parsed, openLocks) }; solidsCache.set(parsed, entry); }
    return entry.solids;
}

function moveToward(robot, target, speed, dt, solids) {
    const dist = Math.hypot(target.x - robot.x, target.z - robot.z);
    if (dist < 0.05) return { x: robot.x, z: robot.z, arrived: true };
    const s = Math.min(dist, speed * dt);
    const ux = (target.x - robot.x) / dist, uz = (target.z - robot.z) / dist;
    return { ...slide(robot, ux * s, uz * s, solids, { r: ROBOT.radius, step: 0 }), arrived: dist <= speed * dt };
}

// patrol → (in sight) alert → (noticeS of sight) chase → (giveUpS without sight) patrol. Frozen: nothing moves.
// A player standing on top of something is still seen; extra = more solids (a sort run's fences).
export function stepRobot(robot, player, dt, parsed, openLocks = new Set(), extra = []) {
    if (robot.frozenS > 0) return { ...robot, frozenS: Math.max(0, robot.frozenS - dt) };
    const solids = extra.length ? [...cachedSolids(parsed, openLocks), ...extra] : cachedSolids(parsed, openLocks);
    const visible = player && sees(robot, player, opaqueWith(parsed, openLocks));
    const r = { ...robot };
    if (r.mode === 'chase') {
        if (visible) { r.lostS = 0; r.lastSeen = { x: player.x, z: player.z }; } else r.lostS += dt;
        if (r.lostS >= ROBOT.giveUpS) return { ...r, mode: 'patrol', seenS: 0, lostS: 0, lastSeen: null };
        const target = r.lastSeen ?? player;
        const m = moveToward(r, target, ROBOT.chase, dt, solids);
        r.dir = turnTo(r.dir, angleTo(r, target), dt);
        return { ...r, x: m.x, z: m.z };
    }
    if (visible) {
        r.mode = 'alert';
        r.seenS += dt;
        r.dir = turnTo(r.dir, angleTo(r, player), dt);
        if (r.seenS >= ROBOT.noticeS) return { ...r, mode: 'chase', lostS: 0, lastSeen: { x: player.x, z: player.z } };
        return r;
    }
    r.mode = 'patrol';
    r.seenS = 0;
    const target = r.path[r.wp];
    const m = moveToward(r, target, ROBOT.patrol, dt, solids);
    r.x = m.x; r.z = m.z;
    if (m.arrived) r.wp = (r.wp + 1) % r.path.length;
    r.dir = turnTo(r.dir, angleTo(r, r.path[r.wp]), dt);
    return r;
}

export const near = (a, b, dist) => Math.hypot(a.x - b.x, a.z - b.z) <= dist;
export const caught = (robot, player) => robot.frozenS <= 0 && near(robot, player, ROBOT.catchDist) && (player.y ?? 0) < 1.2;
