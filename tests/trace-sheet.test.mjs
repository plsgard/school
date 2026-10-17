// tests/trace-sheet.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { modelSvg, sheetSvg } from '../tools/trace-sheet.mjs';

describe('modelSvg', () => {
    test('modelSvg_TwoStrokeModel_DrawsTwoCorridorsGreenAndBlueDots', () => {
        const svg = modelSvg({ pts: [[20, 72], [40, 50], [60, 72]], pts2: [[30, 30], [60, 30]] });
        assert.equal((svg.match(/stroke="#b9c6d9"/g) ?? []).length, 2);
        assert.match(svg, /fill="#4cb944"/);
        assert.match(svg, /fill="#4c8fd9"/);
        assert.match(svg, /y1="92"/); // descender line
    });
    test('modelSvg_ThreeStrokeCapModel_ThreeCorridorsAndNumberedDots', () => {
        const A = [[[50, 16], [26, 72]], [[50, 16], [74, 72]], [[36, 52], [64, 52]]];
        const svg = modelSvg({ strokes: A, lignage: 'cap' });
        assert.equal((svg.match(/stroke="#b9c6d9"/g) ?? []).length, 3);
        assert.match(svg, />1</);
        assert.match(svg, />3</);
        assert.doesNotMatch(svg, />2</); // stroke 2 starts on stroke 1's dot: hidden until stroke 1 is done
        assert.doesNotMatch(svg, /y1="92"/);
        assert.match(modelSvg({ strokes: A, lignage: 'cap' }, { state: 1 }), />2</);
    });
    test('sheetSvg_TwentySixModels_SquareCanvas', () => {
        const svg = sheetSvg(Array.from({ length: 26 }, () => ({ model: { pts: [[20, 72], [60, 72]] }, title: 'a' })));
        const [, w, h] = svg.match(/^<svg [^>]*width="(\d+)" height="(\d+)"/);
        assert.equal(w, h);
        assert.equal((svg.match(/<svg x="/g) ?? []).length, 26);
    });
});
