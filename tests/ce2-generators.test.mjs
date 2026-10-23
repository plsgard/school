// tests/ce2-generators.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LOCKABLE, levelById, accepts, generate } from '../assets/ce2/generators.js';
import { solve, borrowMask } from '../assets/ce2/method.js';

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const draws = (levelId, n, seed = 7) => {
    const rng = seeded(seed);
    const out = [];
    let previous = null;
    for (let i = 0; i < n; i++) out.push(previous = generate(levelId, { rng, previous }));
    return out;
};

describe('LEVELS', () => {
    test('LEVELS_Ids_AreOneToEightInOrder', () => {
        assert.deepEqual(LEVELS.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8]);
        assert.deepEqual(LOCKABLE, [7, 8]);
    });
    test('LEVELS_Examples_AcceptedByTheirOwnLevel', () => {
        for (const l of LEVELS) {
            const [top, bottom] = l.example.split(' − ').map(Number);
            assert.ok(accepts(l, top, bottom), `${l.id}: ${l.example}`);
        }
    });
    test('LEVELS_Labels_HaveNoSpaceBeforePunctuation', () => {
        for (const l of LEVELS) assert.doesNotMatch(l.label, / [:;!?]/);
    });
});

describe('accepts', () => {
    test('accepts_ResultLosesADigit_Rejected', () => {
        assert.equal(accepts(levelById(6), 452, 378), false); // 74: a leading 0 in the hundreds cell
    });
    test('accepts_TopNotAboveBottom_Rejected', () => {
        assert.equal(accepts(levelById(3), 241, 241), false);
        assert.equal(accepts(levelById(3), 241, 578), false);
    });
    test('accepts_Level7WithoutBorrowOnAZero_Rejected', () => {
        assert.equal(accepts(levelById(7), 405, 102), false); // zero in the top, but 0 − 0 needs no borrow
    });
});

describe('generate', () => {
    test('generate_EveryLevel_MatchesItsBorrowRuleOver2000Draws', () => {
        for (const l of LEVELS) {
            for (const p of draws(l.id, 2000)) {
                assert.equal(p.level, l.id);
                assert.ok(accepts(l, p.top, p.bottom), `${l.id}: ${p.top} − ${p.bottom}`);
                assert.equal(String(p.top).length, l.top);
                assert.ok(l.bottom.includes(String(p.bottom).length), `${l.id}: ${p.bottom}`);
                if (l.mask) assert.equal(borrowMask(p.top, p.bottom), l.mask);
            }
        }
    });
    test('generate_EveryLevel_ResultPositiveAndKeepsTopDigitCount', () => {
        for (const l of LEVELS) {
            for (const p of draws(l.id, 500, 3)) {
                const r = solve(p.top, p.bottom).result;
                assert.ok(r > 0);
                assert.equal(String(r).length, String(p.top).length);
            }
        }
    });
    test('generate_WithPrevious_NeverRepeatsIt', () => {
        for (const l of LEVELS) {
            const seq = draws(l.id, 500, 11);
            for (let i = 1; i < seq.length; i++) {
                assert.notDeepEqual([seq[i].top, seq[i].bottom], [seq[i - 1].top, seq[i - 1].bottom]);
            }
        }
    });
    test('generate_Level6_SometimesShortBottom', () => {
        const lengths = new Set(draws(6, 300).map(p => String(p.bottom).length));
        assert.deepEqual([...lengths].sort(), [2, 3]);
    });
    test('generate_Level7_HasZeroInTopWithBorrow', () => {
        for (const p of draws(7, 500)) {
            const cols = solve(p.top, p.bottom).columns;
            assert.ok(cols.some(c => c.top === 0 && c.borrow), `${p.top} − ${p.bottom}`);
        }
    });
    test('generate_UnknownLevel_Throws', () => {
        assert.throws(() => generate(99), /unknown ce2 level/);
    });
});
