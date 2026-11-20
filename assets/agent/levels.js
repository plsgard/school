// assets/agent/levels.js
// Pure: where things are. The island (hub) in metres, centred on 0 (x east, z south), and the mission layouts as
// small grid maps (one cell = TILE metres). validateLayout proves a layout playable; the tests run it on all six.
//   #  wall          .  floor           c  cover crate (blocks movement and sight, 1 m: he can jump on it)
//   S  spawn         E  exit            0–9  lock doors, opened in order (infiltration)
//   P  crate dispenser                  A–D  drop zones (sort run)
export const TILE = 2;

const infiltration = [
    {
        id: 'serpentine',
        rows: [
            '#########################',
            '#.....#..c..#.....#...c.#',
            '#.S...0.....1.....2.....#',
            '#.....#.....#..c..#.....#',
            '#####################3###',
            '#..c....#.......#.....c.#',
            '#.......5.......4.......#',
            '#.......#...c...#.......#',
            '###6#####################',
            '#.....#..c..#.....#.....#',
            '#.....7.....8.....9...E.#',
            '#..c..#.....#..c..#.....#',
            '#########################',
        ],
        patrols: [[[13, 1], [17, 1], [17, 2], [13, 2]], [[10, 5], [14, 5]], [[7, 10], [11, 10], [11, 11], [7, 11]]],
        reserve: [[[17, 7], [23, 7], [23, 6], [17, 6]], [[13, 9], [17, 9], [17, 10], [13, 10]]],
    },
    {
        id: 'towers',
        rows: [
            '#################',
            '#.......#.......#',
            '#.S.....0.......#',
            '#.......#.c.....#',
            '############1####',
            '#.......#.......#',
            '#.c.....2.......#',
            '#....c..#.......#',
            '##3##############',
            '#.......#.......#',
            '#.......4.......#',
            '#...c...#.c.....#',
            '##############5##',
            '#.......#.......#',
            '#.......6....c..#',
            '#..c....#.......#',
            '#####7###########',
            '#.......#...#...#',
            '#.......8...9.E.#',
            '#.......#...#...#',
            '#################',
        ],
        patrols: [[[9, 5], [15, 5], [15, 7], [9, 7]], [[1, 9], [7, 9], [7, 10], [1, 10]], [[1, 13], [7, 13], [7, 14], [1, 14]]],
        reserve: [[[11, 9], [15, 9], [15, 11], [11, 11]], [[1, 17], [7, 17], [7, 19], [1, 19]]],
    },
    {
        id: 'depot',
        rows: [
            '###########################',
            '#....0.......#.c..#.......#',
            '#.S..#...c...#....2...c...#',
            '#....#.......1....#.......#',
            '########################3##',
            '#........5........#.......#',
            '#....c...#........#...c...#',
            '#........#...c....4.......#',
            '#6#########################',
            '#......#...c...8.....#....#',
            '#...c..7.......#.....#..E.#',
            '#......#.......#..c..9....#',
            '###########################',
        ],
        patrols: [[[7, 1], [11, 1], [11, 3], [7, 3]], [[11, 5], [16, 5], [16, 6], [11, 6]], [[9, 10], [13, 10], [13, 11], [9, 11]]],
        reserve: [[[20, 5], [24, 5], [24, 7], [20, 7]], [[2, 5], [7, 5], [7, 7], [2, 7]]],
    },
];

const sort = [
    {
        id: 'warehouse',
        rows: [
            '###################',
            '#AA......E......BB#',
            '#AA.............BB#',
            '#.................#',
            '#....c...c...c....#',
            '#.................#',
            '#.................#',
            '#...c....P....c...#',
            '#.................#',
            '#.................#',
            '#....c...c...c....#',
            '#.................#',
            '#CC.............DD#',
            '#CC......S......DD#',
            '###################',
        ],
        patrols: [[[3, 3], [15, 3]], [[3, 11], [15, 11]]],
        reserve: [[[7, 5], [11, 5], [11, 9], [7, 9]], [[2, 5], [2, 9]]],
    },
    {
        id: 'hall',
        rows: [
            '#########################',
            '#....AAA.........BBB....#',
            '#....AAA....c....BBB....#',
            '#........c.....c........#',
            '#.......................#',
            '#S..........P..........E#',
            '#.......................#',
            '#........c.....c........#',
            '#....CCC....c....DDD....#',
            '#....CCC.........DDD....#',
            '#########################',
        ],
        patrols: [[[3, 4], [21, 4]], [[3, 6], [21, 6]]],
        reserve: [[[6, 3], [6, 7]], [[18, 3], [18, 7]]],
    },
    {
        id: 'yard',
        rows: [
            '#####################',
            '########.AAA.########',
            '########.AAA.########',
            '########.....########',
            '########.....########',
            '########.c...########',
            '########...c.########',
            '########.....########',
            '#...........E.......#',
            '#CC..c............DD#',
            '#CC.......P.......DD#',
            '#CC...c........c..DD#',
            '#.......S...........#',
            '########.....########',
            '########.....########',
            '########...c.########',
            '########.....########',
            '########.....########',
            '########.BBB.########',
            '########.BBB.########',
            '#####################',
        ],
        patrols: [[[3, 10], [8, 10]], [[12, 10], [17, 10]]],
        reserve: [[[10, 3], [10, 7]], [[10, 13], [10, 17]]],
    },
];

export const LAYOUTS = { infiltration, sort };

export function parseLayout(layout) {
    const { rows } = layout;
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? rows[y][x] ?? '#' : '#');
    const solid = (x, y) => at(x, y) === '#' || at(x, y) === 'c';
    const out = { id: layout.id, w, h, solid, opaque: solid, at, spawn: null, exit: null, locks: [], dispenser: null, zones: [],
        patrols: layout.patrols, reserve: layout.reserve ?? [] };
    const zones = {};
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ch = at(x, y);
            if (ch === 'S') out.spawn = { x, y };
            else if (ch === 'E') out.exit = { x, y };
            else if (ch === 'P') out.dispenser = { x, y };
            else if (ch >= '0' && ch <= '9') out.locks.push({ i: Number(ch), x, y });
            else if (ch >= 'A' && ch <= 'D') (zones[ch] ??= []).push({ x, y });
        }
    }
    out.locks.sort((a, b) => a.i - b.i);
    out.zones = Object.keys(zones).sort().map(k => ({ i: k.charCodeAt(0) - 65, tiles: zones[k] }));
    return out;
}

// Cells reachable from the spawn, walking in 4 directions, with the given locks open.
function reach(parsed, open) {
    const closed = new Set(parsed.locks.filter(l => !open.has(l.i)).map(l => `${l.x},${l.y}`));
    const free = (x, y) => !parsed.solid(x, y) && !closed.has(`${x},${y}`);
    const seen = new Set();
    if (!parsed.spawn) return seen;
    const stack = [[parsed.spawn.x, parsed.spawn.y]];
    while (stack.length) {
        const [x, y] = stack.pop();
        const k = `${x},${y}`;
        if (seen.has(k) || !free(x, y)) continue;
        seen.add(k);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return seen;
}
const touches = (cells, { x, y }) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells.has(`${x + dx},${y + dy}`));
const range = (n) => new Set(Array.from({ length: n }, (_, i) => i));

// Every reason the layout cannot be played; [] = playable.
export function validateLayout(parsed, type) {
    const errors = [];
    if (!parsed.spawn) errors.push('no spawn');
    if (!parsed.exit) errors.push('no exit');
    const floor = ([x, y]) => !parsed.solid(x, y) && !/[0-9]/.test(parsed.at(x, y));
    for (const path of [...parsed.patrols, ...parsed.reserve]) {
        for (const p of path) if (!floor(p)) errors.push(`patrol waypoint ${p} is not on floor`);
    }
    if (type === 'infiltration') {
        const ids = parsed.locks.map(l => l.i).join(',');
        if (ids !== '0,1,2,3,4,5,6,7,8,9') errors.push(`locks must be 0 to 9 once each, got ${ids}`);
        for (const lock of parsed.locks) {
            if (!touches(reach(parsed, range(lock.i)), lock)) errors.push(`lock ${lock.i} unreachable with the locks below it open`);
        }
        if (parsed.exit) {
            const k = `${parsed.exit.x},${parsed.exit.y}`;
            if (reach(parsed, range(9)).has(k)) errors.push('exit reachable with lock 9 closed');
            if (!reach(parsed, range(10)).has(k)) errors.push('exit unreachable with every lock open');
        }
        if (parsed.patrols.length < 2) errors.push('needs 2 patrols');
    } else {
        const cells = reach(parsed, new Set());
        if (!parsed.dispenser) errors.push('no dispenser');
        else if (!cells.has(`${parsed.dispenser.x},${parsed.dispenser.y}`)) errors.push('dispenser unreachable');
        if (parsed.zones.length < 4) errors.push('needs 4 zones');
        for (const z of parsed.zones) if (!z.tiles.some(t => cells.has(`${t.x},${t.y}`))) errors.push(`zone ${z.i} unreachable`);
        if (parsed.exit && !cells.has(`${parsed.exit.x},${parsed.exit.y}`)) errors.push('exit unreachable');
    }
    return errors;
}

// ---- the island ----
// Boxes { x, z, w, d, h, kind, color?, sign? }: x, z the centre, w along x, d along z, h from the ground.
const b = (kind, x, z, w, d, h, extra = {}) => ({ kind, x, z, w, d, h, ...extra });

const solids = [
    // Harbour (south): warehouses, the hideout, crates, a lighthouse.
    b('building', -45, 122, 18, 12, 5, { color: 0xb5543c, sign: 'WAREHOUSE' }),
    b('building', 45, 122, 18, 12, 5, { color: 0x3c7db5, sign: 'HARBOUR' }),
    b('hideout', -18, 96, 10, 8, 3, { color: 0x4a4e69, sign: 'HIDEOUT' }),
    b('crate', -12, 92, 2, 2, 1), b('crate', -12, 94, 2, 2, 2),
    b('crate', 20, 110, 2, 2, 1), b('crate', 22, 110, 2, 2, 1), b('crate', 21, 112, 2, 2, 1),
    b('tower', 0, 136, 4, 4, 12, { color: 0xf2f2f2 }),
    // Cobalt Academy (north-west): the school and its buildings, signs from his decks.
    b('building', -60, -78, 52, 14, 8, { color: 0x5f7fbf, sign: 'COBALT ACADEMY' }),
    b('building', -98, -44, 14, 12, 5, { color: 0x8e6bbf, sign: 'LIBRARY' }),
    b('building', -22, -44, 14, 12, 5, { color: 0xbf8e5f, sign: 'CANTEEN' }),
    b('building', -60, -30, 16, 8, 3, { color: 0x5fbf8e, sign: 'PLAYGROUND' }),
    b('crate', -50, -27, 2, 2, 1), b('crate', -50, -29, 2, 2, 2),
    // Market, farm and dairy (north-east).
    b('building', 95, -72, 20, 14, 6, { color: 0xa63d40, sign: 'FARM' }),
    b('building', 36, -76, 16, 12, 5, { color: 0xf4f1de, sign: 'DAIRY' }),
    b('building', 65, -78, 14, 10, 3, { color: 0xe9c46a, sign: 'MARKET' }),
    b('crate', 57, -71, 2, 2, 1), b('crate', 57, -73, 2, 2, 2),
    b('stall', 45, -32, 4, 2, 1, { color: 0xe76f51 }), b('stall', 57, -32, 4, 2, 1, { color: 0x2a9d8f }),
    b('stall', 69, -32, 4, 2, 1, { color: 0xe9c46a }), b('stall', 81, -32, 4, 2, 1, { color: 0xf4a261 }),
    // Clock Square, radio tower and power station (phase 2: scenery for now).
    b('tower', 0, -8, 8, 8, 14, { color: 0xd8c99b, sign: 'CLOCK SQUARE' }),
    b('tower', 115, 55, 4, 4, 22, { color: 0xc0c0c0, sign: 'RADIO' }),
    b('building', -112, 58, 22, 16, 6, { color: 0x6c757d, sign: 'POWER STATION' }),
    // Trees (trunks block; the crown is drawn by the scene).
    ...[[-30, 60], [30, 60], [-75, 20], [75, 20], [-120, -100], [120, -110], [-5, -60], [10, 40], [-90, 100], [95, 95],
        [-130, 10], [130, -20], [-40, -110], [40, -115], [0, 80], [-60, 40], [60, 40]].map(([x, z]) => b('tree', x, z, 1, 1, 3)),
];

export const ISLAND = {
    size: 300,
    spawn: { x: 0, z: 108 },
    solids,
    districts: [
        { id: 'harbour', subject: null, sign: 'HARBOUR', slots: [] },
        { id: 'academy', subject: 'en', sign: 'COBALT ACADEMY',
            slots: [-88, -80, -72, -64, -56, -48, -40, -32].map(x => ({ x, z: -60 })) },
        { id: 'market', subject: 'svt', sign: 'MARKET',
            slots: [40, 50, 60, 70, 80, 90].map(x => ({ x, z: -50 })) },
    ],
    hideout: { x: -18, z: 103 },
    chips: [
        { id: 'chip-1', x: -18, y: 3, z: 96 },
        { id: 'chip-2', x: -60, y: 3, z: -30 },
        { id: 'chip-3', x: 65, y: 3, z: -78 },
        { id: 'chip-4', x: -98, y: 0, z: -58 },
        { id: 'chip-5', x: -22, y: 0, z: -58 },
        { id: 'chip-6', x: 36, y: 0, z: -66 },
        { id: 'chip-7', x: 21, y: 1, z: 112 },
        { id: 'chip-8', x: 120, y: 0, z: 120 },
        { id: 'chip-9', x: -130, y: 0, z: -130 },
        { id: 'chip-10', x: 130, y: 0, z: -135 },
        { id: 'chip-11', x: -135, y: 0, z: 125 },
        { id: 'chip-12', x: 0, y: 0, z: -140 },
    ],
};

// The district a subject's beacons go to: its own, or the market for a subject that has none yet.
const districtOf = (subject) => ISLAND.districts.find(d => d.subject === subject) ?? ISLAND.districts.find(d => d.id === 'market');

// One beacon per lesson, in catalog order, in its subject's district; a lesson beyond the slots gets none.
export function beaconsFor(catalog) {
    const used = new Map();
    const out = [];
    for (const lesson of catalog) {
        const d = districtOf(lesson.subject);
        const n = used.get(d.id) ?? 0;
        if (n >= d.slots.length) continue;
        used.set(d.id, n + 1);
        out.push({ lessonId: lesson.id, district: d.id, ...d.slots[n] });
    }
    return out;
}
