// tests/trace-geom.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LIGNAGE, curveSegments, arrowSpots } from '../assets/gs/trace-geom.js';

describe('curveSegments', () => {
    test('curveSegments_StraightLine_ControlPointsOnTheLine', () => {
        const segs = curveSegments([[10, 50], [30, 50], [50, 50]]);
        assert.equal(segs.length, 2);
        for (const s of segs) for (let i = 1; i < 6; i += 2) assert.equal(s[i], 50);
        assert.deepEqual(segs[1].slice(4), [50, 50]);
    });
});
describe('arrowSpots', () => {
    test('arrowSpots_RetracedStem_PairsOfOppositeArrowsBesideTheStem', () => {
        const spots = arrowSpots([[50, 72], [50, 30], [50, 72]]);
        const up = spots.filter(s => Math.abs(s.ang + Math.PI / 2) < 1e-9), down = spots.filter(s => Math.abs(s.ang - Math.PI / 2) < 1e-9);
        assert.ok(up.length >= 1);
        assert.equal(up.length + down.length, spots.length);
        assert.equal(up.length, down.length);
        // Each arrow sits 2.5 to the right of its own direction: ↑ on the right (x 52.5), ↓ on the left (x 47.5).
        assert.ok(up.every(s => Math.abs(s.x - 52.5) < 1e-9) && down.every(s => Math.abs(s.x - 47.5) < 1e-9));
        // One pair per place: the way back does not add a second pair on top of the first.
        const ys = up.map(s => s.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 13);
    });
    test('arrowSpots_PathCrossingItself_NoPairAtTheCrossing', () => {
        // A loop (l, h, k): the way down crosses the way up at (40, 51) but never runs along it.
        const loop = [[20, 72], [60, 30], [60, 16], [40, 16], [40, 72]];
        const spots = arrowSpots(loop, 2, 2); // an arrow every 2 units, so one lands on the crossing
        const total = spots.length;
        assert.ok(total > 0);
        assert.ok(spots.every(s => loop.slice(1).some((b, i) => { // every arrow lies on the path itself (no offset)
            const a = loop[i], t = ((s.x - a[0]) * (b[0] - a[0]) + (s.y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
            return t >= -1e-9 && t <= 1 + 1e-9 && Math.hypot(a[0] + t * (b[0] - a[0]) - s.x, a[1] + t * (b[1] - a[1]) - s.y) < 1e-6;
        })));
    });
    test('arrowSpots_OpenPath_PointsAlongTheDirection', () => {
        const [first] = arrowSpots([[10, 50], [90, 50]]);
        assert.equal(first.ang, 0);
    });
});
describe('LIGNAGE', () => {
    test('LIGNAGE_Lines_TopToBottom', () => {
        assert.deepEqual(Object.values(LIGNAGE), [16, 30, 42, 72, 92]);
    });
});
