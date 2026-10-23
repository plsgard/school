// assets/ce2/generators.js
// Pure: the CE2 subtraction ladder and a generator of fresh problems whose borrow pattern is exactly the level's
// (rejection sampling). Eduscol (début de CE2, août 2026): borrows on the tens and on the hundreds are studied
// separately before they are met together, numbers up to 10 000. Levels 7 and 8 stay locked until a parent unlocks them.
//
// The zero pitfall (a 0 of the top number that needs the +10: 405 − 127) belongs to level 7 only: every other level
// rejects it, except level 8 once level 7 is unlocked (`zeros: true`), so a locked level 7 really keeps zeros away.
//
// The result always keeps the top number's digit count: 452 − 378 = 74 would ask for a 0 in the hundreds cell, which
// the class never writes.
import { solve } from './method.js';

// mask: borrow per column, units first ('010' = only the tens borrow). bottom: allowed digit counts of the bottom number.
export const LEVELS = [
    { id: 1, label: '2 chiffres, sans retenue', example: '58 − 23', top: 2, bottom: [2], mask: '00' },
    { id: 2, label: '2 chiffres, retenue aux unités', example: '52 − 27', top: 2, bottom: [2], mask: '10' },
    { id: 3, label: '3 chiffres, sans retenue', example: '578 − 241', top: 3, bottom: [3], mask: '000' },
    { id: 4, label: '3 chiffres, retenue aux unités', example: '453 − 128', top: 3, bottom: [3], mask: '100' },
    { id: 5, label: '3 chiffres, retenue aux dizaines', example: '528 − 173', top: 3, bottom: [2, 3], mask: '010' },
    { id: 6, label: '3 chiffres, deux retenues', example: '452 − 78', top: 3, bottom: [2, 3], mask: '110' },
    { id: 7, label: 'Un zéro en haut', example: '405 − 127', top: 3, bottom: [2, 3], zeroTop: true },
    { id: 8, label: '4 chiffres', example: '2718 − 384', top: 4, bottom: [3, 4], minBorrows: 1, zerosOnUnlock: true },
];
export const LOCKABLE = [7, 8];
export const levelById = (id) => LEVELS.find(l => l.id === id);

const randDigits = (n, rng) => 10 ** (n - 1) + Math.floor(rng() * 9 * 10 ** (n - 1));

export function accepts(level, top, bottom, { zeros = false } = {}) {
    if (top <= bottom || String(top - bottom).length !== String(top).length) return false;
    const { columns } = solve(top, bottom);
    // The zero pitfall is « 0 − 3, je ne peux pas »: a zero of the top number that needs the +10.
    const zeroPitfall = columns.some(c => c.top === 0 && c.borrow);
    if (level.zeroTop) return zeroPitfall;
    if (zeroPitfall && !(level.zerosOnUnlock && zeros)) return false;
    if (level.mask) return columns.map(c => (c.borrow ? '1' : '0')).join('') === level.mask;
    return columns.filter(c => c.borrow).length >= (level.minBorrows ?? 0);
}

export function generate(levelId, { rng = Math.random, previous = null, zeros = false } = {}) {
    const level = levelById(levelId);
    if (!level) throw new Error(`unknown ce2 level ${levelId}`);
    // The bottom's digit count is drawn once: drawn per try, the shorter count (accepted more often) would win ~3 in 4.
    const bottomDigits = level.bottom[Math.floor(rng() * level.bottom.length)];
    for (let i = 0; i < 20000; i++) {
        const top = randDigits(level.top, rng);
        const bottom = randDigits(bottomDigits, rng);
        if (previous && previous.top === top && previous.bottom === bottom) continue;
        if (accepts(level, top, bottom, { zeros })) return { level: levelId, top, bottom };
    }
    throw new Error(`no problem found for level ${levelId}`);
}
