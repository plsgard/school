// tests/ce2-method.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { solve, borrowMask, columnHint, digitsOf } from '../assets/ce2/method.js';

const pick = (sol, key) => sol.columns.map(c => c[key]);

describe('solve', () => {
    test('digitsOf_Number_UnitsFirst', () => {
        assert.deepEqual(digitsOf(1272), [2, 7, 2, 1]);
    });
    test('solve_52Minus27_BorrowsAtUnits', () => {
        const sol = solve(52, 27);
        assert.equal(sol.result, 25);
        assert.deepEqual(pick(sol, 'digit'), [5, 2]);
        assert.deepEqual(pick(sol, 'borrow'), [true, false]);
        assert.deepEqual(pick(sol, 'carryIn'), [0, 1]);
        assert.deepEqual(pick(sol, 'sub'), [7, 3]);
    });
    test('solve_405Minus127_ZeroInTopBorrowsTwice', () => {
        const sol = solve(405, 127);
        assert.deepEqual(pick(sol, 'digit'), [8, 7, 2]);
        assert.equal(borrowMask(405, 127), '110');
    });
    test('solve_600Minus258_Gives342', () => {
        assert.deepEqual(pick(solve(600, 258), 'digit'), [2, 4, 3]);
    });
    test('solve_1272Minus384_Gives888', () => {
        assert.deepEqual(pick(solve(1272, 384), 'digit'), [8, 8, 8, 0]);
        assert.equal(borrowMask(1272, 384), '1110');
    });
    test('solve_452Minus78_ShortBottomGetsCarryOnEmptyPlace', () => {
        const col = solve(452, 78).columns[2];
        assert.deepEqual(col, { top: 4, bottom: null, carryIn: 1, sub: 1, borrow: false, digit: 3 });
    });
    test('borrowMask_NoBorrow_AllZeros', () => {
        assert.equal(borrowMask(578, 241), '000');
    });
});

describe('columnHint', () => {
    const [units, tens] = solve(52, 27).columns;
    test('columnHint_Borrow_SaysAddTenOnTopAndOneBelow', () => {
        const h = columnHint(units, 0);
        assert.match(h, /j’ajoute 10 en haut \(12\), et j’écris 1 en bas dans la colonne des dizaines/);
        assert.match(h, /12 − 7 = 5/);
    });
    test('columnHint_CarryIn_MentionsTheOneBelow', () => {
        assert.match(columnHint(tens, 1), /2 \+ 1 = 3/);
        assert.match(columnHint(tens, 1), /5 − 3 = 2/);
    });
    test('columnHint_EmptyBottomPlace_CountsItAsZero', () => {
        assert.match(columnHint(solve(452, 78).columns[2], 2), /0 \+ 1 = 1/);
    });
    test('columnHint_NoReveal_HidesTheDigit', () => {
        const h = columnHint(units, 0, { reveal: false });
        assert.match(h, /12 − 7 = …/);
        assert.doesNotMatch(h, /= 5/);
    });
    test('columnHint_AnyColumn_UsesNbspBeforePunctuation', () => {
        for (const [t, b] of [[52, 27], [405, 127], [1272, 384]]) {
            solve(t, b).columns.forEach((c, i) => assert.doesNotMatch(columnHint(c, i), / [:;!?]/));
        }
    });
});
