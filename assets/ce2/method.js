// assets/ce2/method.js
// Pure: column subtraction by compensation ("conservation des écarts"), the method of Augustin's class. Units first:
// when the top digit is smaller than the bottom digit (+ the 1 written below by the previous column), add 10 to the top
// digit and write 1 under the next bottom digit. The next column then subtracts bottom + 1. An empty bottom place
// (452 − 78) counts as 0, so it can still receive the 1.
const NBSP = ' ';
export const COLUMN_NAMES = ['unités', 'dizaines', 'centaines', 'milliers'];
export const digitsOf = (n) => String(n).split('').reverse().map(Number);

// Columns are units first: { top, bottom (null = empty place), carryIn (the 1 written below), sub, borrow, digit }.
export function solve(top, bottom) {
    const t = digitsOf(top);
    const b = digitsOf(bottom);
    const columns = [];
    let carry = 0;
    for (let i = 0; i < t.length; i++) {
        const bi = i < b.length ? b[i] : null;
        const sub = (bi ?? 0) + carry;
        const borrow = t[i] < sub;
        columns.push({ top: t[i], bottom: bi, carryIn: carry, sub, borrow, digit: t[i] + (borrow ? 10 : 0) - sub });
        carry = borrow ? 1 : 0;
    }
    return { top, bottom, result: top - bottom, columns };
}

export const borrowMask = (top, bottom) => solve(top, bottom).columns.map(c => (c.borrow ? '1' : '0')).join('');

// What the teacher would say for column i, in the method's words. reveal: false keeps the digit to find (« 12 − 7 = … »).
export function columnHint(col, i, { reveal = true } = {}) {
    const end = reveal ? col.digit : '…';
    const parts = [];
    if (col.carryIn) parts.push(`N’oublie pas le 1 en bas${NBSP}: ${col.bottom ?? 0} + 1 = ${col.sub}.`);
    if (col.borrow) {
        parts.push(`${col.top} est plus petit que ${col.sub}${NBSP}: j’ajoute 10 en haut (${col.top + 10}), et j’écris 1 en bas dans la colonne des ${COLUMN_NAMES[i + 1]}.`);
        parts.push(`${col.top + 10} − ${col.sub} = ${end}`);
    } else parts.push(`${col.top} − ${col.sub} = ${end}`);
    return parts.join(' ') + (reveal ? '.' : '');
}
