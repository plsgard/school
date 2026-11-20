import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, LAYOUTS, parseLayout, validateLayout, ISLAND, beaconsFor } from '../assets/agent/levels.js';
import { PLAYER, groundAt } from '../assets/agent/world.js';

const replaceAt = (rows, x, y, ch) => rows.map((r, j) => (j === y ? r.slice(0, x) + ch + r.slice(x + 1) : r));

describe('layouts', () => {
    test('validateLayout_EveryShippedLayout_ReturnsNoError', () => {
        assert.equal(LAYOUTS.infiltration.length, 3);
        assert.equal(LAYOUTS.sort.length, 3);
        for (const [type, list] of Object.entries(LAYOUTS)) {
            for (const layout of list) assert.deepEqual(validateLayout(parseLayout(layout), type), [], `${type}/${layout.id}`);
        }
    });
    test('parseLayout_Serpentine_FindsSpawnExitAndTenLocks', () => {
        const p = parseLayout(LAYOUTS.infiltration[0]);
        assert.deepEqual([p.w, p.h, p.spawn, p.exit, p.locks.length, p.locks[0]], [25, 13, { x: 2, y: 2 }, { x: 22, y: 10 }, 10, { i: 0, x: 6, y: 2 }]);
        assert.equal(p.solid(0, 0), true);
        assert.equal(p.solid(9, 1), true);
        assert.equal(p.solid(6, 2), false);
        assert.equal(p.solid(-1, 3), true);
    });
    test('parseLayout_Warehouse_FindsDispenserAndFourZones', () => {
        const p = parseLayout(LAYOUTS.sort[0]);
        assert.deepEqual(p.dispenser, { x: 9, y: 7 });
        assert.deepEqual(p.zones.map(z => [z.i, z.tiles.length]), [[0, 4], [1, 4], [2, 4], [3, 4]]);
    });
    test('validateLayout_LockUnreachable_ReportsIt', () => {
        const base = LAYOUTS.infiltration[0];
        // Wall in the room in front of lock 5 (its only floor neighbour, column 9 of row 6, becomes a wall).
        const rows = replaceAt(replaceAt(replaceAt(base.rows, 9, 5, '#'), 9, 6, '#'), 9, 7, '#');
        const errors = validateLayout(parseLayout({ ...base, rows }), 'infiltration');
        assert.ok(errors.some(e => e.startsWith('lock 5') || e.startsWith('lock 6')), errors.join('; '));
    });
    test('validateLayout_ExitReachableWithLock9Closed_ReportsIt', () => {
        const base = LAYOUTS.infiltration[0];
        const rows = replaceAt(base.rows, 18, 11, '.');
        assert.ok(validateLayout(parseLayout({ ...base, rows }), 'infiltration').includes('exit reachable with lock 9 closed'));
    });
    test('validateLayout_DuplicateLock_ReportsIt', () => {
        const base = LAYOUTS.infiltration[0];
        const rows = replaceAt(base.rows, 18, 10, '8');
        assert.ok(validateLayout(parseLayout({ ...base, rows }), 'infiltration').some(e => e.startsWith('locks must be')));
    });
    test('validateLayout_PatrolOnAWall_ReportsIt', () => {
        const base = LAYOUTS.infiltration[0];
        assert.equal(validateLayout(parseLayout({ ...base, patrols: [...base.patrols, [[0, 0], [1, 1]]] }), 'infiltration').length, 1);
    });
    test('validateLayout_SortWithThreeZones_ReportsIt', () => {
        const base = LAYOUTS.sort[0];
        const rows = base.rows.map(r => r.replaceAll('D', '.'));
        assert.ok(validateLayout(parseLayout({ ...base, rows }), 'sort').includes('needs 4 zones'));
    });
});

describe('island', () => {
    // Flood fill on a 1 m grid with the walking rules: a step up of at most PLAYER.step, any step down, no jump.
    function reachable() {
        const half = ISLAND.size / 2;
        const h = (x, z) => groundAt(x, z, 99, ISLAND.solids, 0.01, 0);
        const height = new Map();
        const H = (x, z) => { const k = `${x},${z}`; if (!height.has(k)) height.set(k, h(x + 0.5, z + 0.5)); return height.get(k); };
        const start = [Math.floor(ISLAND.spawn.x), Math.floor(ISLAND.spawn.z)];
        const seen = new Set([start.join(',')]);
        const stack = [start];
        while (stack.length) {
            const [x, z] = stack.pop();
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, nz = z + dz;
                const k = `${nx},${nz}`;
                if (seen.has(k) || Math.abs(nx) >= half - 2 || Math.abs(nz) >= half - 2) continue;
                if (H(nx, nz) - H(x, z) > PLAYER.step) continue;
                seen.add(k);
                stack.push([nx, nz]);
            }
        }
        return (p) => seen.has(`${Math.floor(p.x)},${Math.floor(p.z)}`);
    }
    test('ISLAND_EverySlotAndTheHideout_ReachableFromSpawn', () => {
        const ok = reachable();
        for (const d of ISLAND.districts) for (const s of d.slots) assert.ok(ok(s), `${d.id} ${s.x},${s.z}`);
        assert.ok(ok(ISLAND.hideout));
        assert.ok(ISLAND.districts.find(d => d.id === 'academy').slots.length >= 8);
        assert.ok(ISLAND.districts.find(d => d.id === 'market').slots.length >= 6);
    });
    test('ISLAND_EveryChip_StandsOnASolidTopOrTheGround', () => {
        assert.equal(ISLAND.chips.length, 12);
        assert.equal(new Set(ISLAND.chips.map(c => c.id)).size, 12);
        for (const c of ISLAND.chips) {
            const tops = ISLAND.solids.filter(b => Math.abs(c.x - b.x) <= b.w / 2 && Math.abs(c.z - b.z) <= b.d / 2).map(b => b.h);
            const ground = tops.length ? Math.max(...tops) : 0;
            assert.equal(c.y, ground, c.id);
        }
    });
    test('ISLAND_SlotsAndHideout_AreNotInsideASolid', () => {
        const inside = (p) => ISLAND.solids.some(b => Math.abs(p.x - b.x) < b.w / 2 + 1 && Math.abs(p.z - b.z) < b.d / 2 + 1);
        for (const d of ISLAND.districts) for (const s of d.slots) assert.equal(inside(s), false, `${s.x},${s.z}`);
        assert.equal(inside(ISLAND.hideout), false);
        assert.equal(inside(ISLAND.spawn), false);
    });
    test('beaconsFor_Catalog_UsesTheSubjectsDistrictInOrder', () => {
        const beacons = beaconsFor([{ id: 'a', subject: 'en' }, { id: 's', subject: 'svt' }, { id: 'b', subject: 'en' }]);
        assert.deepEqual(beacons.map(b => [b.lessonId, b.district, b.x]), [['a', 'academy', -88], ['s', 'market', 40], ['b', 'academy', -80]]);
    });
    test('beaconsFor_MoreLessonsThanSlots_GivesNoBeaconToTheRest', () => {
        const catalog = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, subject: 'en' }));
        const beacons = beaconsFor(catalog);
        assert.equal(beacons.length, 8);
        assert.equal(beacons.some(b => b.lessonId === 'l8'), false);
    });
    test('TILE_IsTwoMetres', () => {
        assert.equal(TILE, 2);
    });
});
