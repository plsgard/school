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
    test('arrowSpots_RetracedStem_NoArrowOnTheRetrace', () => {
        const spots = arrowSpots([[50, 72], [50, 30], [50, 72]]);
        assert.deepEqual(spots, []);
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
