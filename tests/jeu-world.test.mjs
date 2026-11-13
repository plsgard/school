// tests/jeu-world.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dist, toward, moveInArena, hits, spawnPoints, moveOnGrid, discTiles } from '../assets/jeu/world.js';

const bounds = { x: 0, y: 100, w: 800, h: 400 };

describe('arena', () => {
    test('moveInArena_IntoAWall_StopsAtTheWallAndReportsIt', () => {
        const p = moveInArena({ x: 30, y: 300 }, -50, 0, 20, bounds);
        assert.deepEqual([p.x, p.y, p.hitX, p.hitY], [20, 300, true, false]);
        const q = moveInArena({ x: 400, y: 110 }, 0, -50, 20, bounds);
        assert.deepEqual([q.y, q.hitY], [120, true]);
    });
    test('moveInArena_IntoARock_IsPushedOut', () => {
        const rock = { x: 400, y: 300, r: 30 };
        const p = moveInArena({ x: 340, y: 300 }, 30, 0, 20, bounds, [rock]);
        assert.ok(dist(p, rock) >= 50 - 1e-9);
    });
    test('moveInArena_FreeSpace_MovesByTheDelta', () => {
        const p = moveInArena({ x: 400, y: 300 }, 5, -3, 20, bounds);
        assert.deepEqual([p.x, p.y, p.hitX, p.hitY], [405, 297, false, false]);
    });
    test('toward_TwoPoints_UnitVector', () => {
        assert.deepEqual(toward({ x: 0, y: 0 }, { x: 0, y: 5 }), { x: 0, y: 1 });
        assert.deepEqual(toward({ x: 1, y: 1 }, { x: 1, y: 1 }), { x: 0, y: 0 });
    });
    test('hits_OverlappingDiscs_True', () => {
        assert.equal(hits({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10), true);
        assert.equal(hits({ x: 0, y: 0 }, 10, { x: 25, y: 0 }, 10), false);
    });
    test('spawnPoints_FourCreatures_InsideAndApart', () => {
        const hero = { x: 400, y: 450 };
        for (let i = 0; i < 50; i++) {
            const pts = spawnPoints(4, bounds, hero, Math.random);
            assert.equal(pts.length, 4);
            for (const p of pts) {
                assert.ok(p.x >= 50 && p.x <= 750 && p.y >= 150 && p.y <= 450);
                assert.ok(dist(p, hero) > 60);
            }
            for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) assert.ok(dist(pts[a], pts[b]) > 60);
        }
    });
    test('spawnPoints_TinyRoom_StillReturnsEveryPoint', () => {
        assert.equal(spawnPoints(4, { x: 0, y: 0, w: 120, h: 120 }, { x: 60, y: 60 }, Math.random).length, 4);
    });
});

describe('village grid', () => {
    const solid = (tx, ty) => tx < 0 || ty < 0 || tx >= 4 || ty >= 4 || (tx === 2 && ty === 1);
    test('moveOnGrid_FreeTiles_Moves', () => {
        assert.deepEqual(moveOnGrid({ x: 32, y: 32 }, 10, 5, 20, 64, solid), { x: 42, y: 37 });
    });
    test('moveOnGrid_IntoASolidTile_SlidesAlongIt', () => {
        const p = moveOnGrid({ x: 100, y: 96 }, 20, 10, 20, 64, solid);
        assert.deepEqual(p, { x: 100, y: 106 });
    });
    test('discTiles_DiscAcrossTwoTiles_BothTiles', () => {
        assert.deepEqual(discTiles({ x: 187, y: 96 }, 20, 64), [{ x: 2, y: 1 }, { x: 3, y: 1 }]);
        assert.deepEqual(discTiles({ x: 96, y: 96 }, 20, 64), [{ x: 1, y: 1 }]);
    });
    test('moveOnGrid_OutOfTheGrid_Blocked', () => {
        assert.deepEqual(moveOnGrid({ x: 24, y: 24 }, -10, -10, 20, 64, solid), { x: 24, y: 24 });
    });
});
