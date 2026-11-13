// assets/jeu/world.js
// Pure geometry of the game: moving a disc in the arena (walls + round rocks) and on the village grid (solid tiles),
// hits, and where creatures appear. No DOM, no state: everything is passed in.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Unit vector from a to b ({0,0} when they coincide).
export function toward(a, b) {
    const d = dist(a, b);
    return d < 1e-6 ? { x: 0, y: 0 } : { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

// Arena: a disc of radius r moved by (dx, dy), kept inside `bounds` and pushed out of the round `rocks`.
// Returns the position and which walls were touched (creatures bounce on them).
export function moveInArena(pos, dx, dy, r, bounds, rocks = []) {
    let x = pos.x + dx;
    let y = pos.y + dy;
    for (const rock of rocks) {
        const d = Math.hypot(x - rock.x, y - rock.y);
        const min = r + rock.r;
        if (d < min) {
            const [nx, ny] = d < 1e-6 ? [1, 0] : [(x - rock.x) / d, (y - rock.y) / d];
            x = rock.x + nx * min;
            y = rock.y + ny * min;
        }
    }
    const cx = clamp(x, bounds.x + r, bounds.x + bounds.w - r);
    const cy = clamp(y, bounds.y + r, bounds.y + bounds.h - r);
    return { x: cx, y: cy, hitX: cx !== x, hitY: cy !== y };
}

export const hits = (a, ra, b, rb) => dist(a, b) < ra + rb;

// n points for the creatures: inside the bounds (margin m), away from the hero and from each other as far as the
// room allows (the required gap shrinks when a spot cannot be found).
export function spawnPoints(n, bounds, hero, rng, m = 50) {
    const points = [];
    let gap = Math.min(bounds.w, bounds.h) / 2;
    while (points.length < n) {
        let placed = false;
        for (let i = 0; i < 30 && !placed; i++) {
            const p = { x: bounds.x + m + rng() * Math.max(1, bounds.w - 2 * m), y: bounds.y + m + rng() * Math.max(1, bounds.h - 2 * m) };
            if (dist(p, hero) >= gap && points.every(q => dist(p, q) >= gap)) { points.push(p); placed = true; }
        }
        if (!placed) gap *= 0.8;
    }
    return points;
}

// Village: a disc moved on a grid of `tile`-sized tiles, one axis at a time so it slides along walls.
// `solid(tx, ty)` says whether a tile blocks (outside the grid must be solid).
export function moveOnGrid(pos, dx, dy, r, tile, solid) {
    const free = (x, y) => {
        for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
            if (solid(Math.floor((x + ox) / tile), Math.floor((y + oy) / tile))) return false;
        }
        return true;
    };
    let { x, y } = pos;
    if (free(x + dx, y)) x += dx;
    if (free(x, y + dy)) y += dy;
    return { x, y };
}

// The tiles a disc touches (its four corners): a blocking item must never be built on any of them, or the disc
// could not move any more.
export function discTiles(pos, r, tile) {
    const seen = new Map();
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const t = { x: Math.floor((pos.x + ox) / tile), y: Math.floor((pos.y + oy) / tile) };
        seen.set(`${t.x},${t.y}`, t);
    }
    return [...seen.values()];
}
