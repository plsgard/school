// assets/jeu/questions.js
// Pure question bank of the CE2 game « L’île des Gribouilles »: every question is a multiple choice
// { skill, level, prompt, answer, choices, clock? } whose choices are carried by the creatures in the arena.
// Maths are generated, French comes from small hand-written banks (correct French only, typography fixed by typo()).
// Each skill has 1–3 levels (the ladder lives in rules.js). `rng` is a () => [0, 1) function.

const NBSP = '\u00a0';

export const typo = (s) => String(s)
    .replace(/'/g, '’')
    .replace(/« /g, `«${NBSP}`).replace(/ »/g, `${NBSP}»`)
    .replace(/ ([?!:;])/g, `${NBSP}$1`);

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export function shuffle(rng, arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const pad2 = (n) => String(n).padStart(2, '0');
// 4 582 with a no-break space, as written in class.
export const fmt = (n) => (n >= 1000 ? `${Math.floor(n / 1000)}${NBSP}${String(n % 1000).padStart(3, '0')}` : String(n));

function make(rng, prompt, answer, distractors, extra = {}) {
    const a = typo(answer);
    const ds = [...new Set(distractors.map(typo))].filter(d => d !== a).slice(0, 3);
    return { prompt: typo(prompt), answer: a, choices: shuffle(rng, [a, ...ds]), ...extra };
}
const around = (rng, n, deltas) => shuffle(rng, deltas.flatMap(d => [n + d, n - d])).filter(x => x >= 0 && x !== n);
const numeric = (rng, prompt, n, wrong) => make(rng, prompt, fmt(n), wrong.filter(x => x >= 0).map(fmt));

// ---------------------------------------------------------------- Nombres

// Numbers in words, 1 to 9 999, in the rectified spelling taught at school (hyphens between all the words:
// « deux-mille-trois-cent-cinq »; « cents » and « quatre-vingts » take an s only at the end of the number).
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
function below100(n) {
    if (n < 17) return UNITS[n];
    if (n < 20) return `dix-${UNITS[n - 10]}`;
    const t = Math.floor(n / 10), u = n % 10;
    if (t === 7) return `soixante-${u === 1 ? 'et-' : ''}${below100(10 + u)}`;
    if (t === 8) return u ? `quatre-vingt-${UNITS[u]}` : 'quatre-vingts';
    if (t === 9) return `quatre-vingt-${below100(10 + u)}`;
    return u === 0 ? TENS[t] : u === 1 ? `${TENS[t]}-et-un` : `${TENS[t]}-${UNITS[u]}`;
}
function below1000(n) {
    const c = Math.floor(n / 100), r = n % 100;
    const hundreds = c === 0 ? '' : c === 1 ? 'cent' : `${UNITS[c]}-cent${r === 0 ? 's' : ''}`;
    return [hundreds, r ? below100(r) : ''].filter(Boolean).join('-');
}
export function inWords(n) {
    const m = Math.floor(n / 1000), r = n % 1000;
    const thousands = m === 0 ? '' : m === 1 ? 'mille' : `${UNITS[m]}-mille`;
    return [thousands, r || !m ? below1000(r) : ''].filter(Boolean).join('-');
}
// A 4-digit number read wrong: digits swapped, a zero forgotten or added.
const misread = (n) => {
    const [m, c, d, u] = String(n).split('').map(Number);
    return [[m, d, c, u], [m, c, u, d], [m, u, d, c], [c || m, m, d, u]].map(ds => Number(ds.join('')))
        .concat([Number([m, c, d, u].filter(Boolean).join('')), n + 1000]);
};

function numCompare(level, rng) {
    if (level === 4) {
        const lo = int(rng, 1, 8) * 1000 + int(rng, 0, 9) * 100 + int(rng, 0, 9) * 10;
        const hi = lo + pick(rng, [20, 50, 100]);
        const n = int(rng, lo + 1, hi - 1);
        return numeric(rng, `Quel nombre est entre ${fmt(lo)} et ${fmt(hi)} ?`, n,
            shuffle(rng, [lo - int(rng, 1, 9), hi + int(rng, 1, 9), lo - 100 + int(rng, 1, 9) * 10, hi + 100 - int(rng, 1, 9) * 10]));
    }
    let nums;
    if (level === 1) nums = new Set(Array.from({ length: 6 }, () => int(rng, 100, 999)));
    else if (level === 2) {
        const t = int(rng, 1, 9) * 1000;
        nums = new Set(Array.from({ length: 8 }, () => t + int(rng, 0, 999)));
    } else {
        const digits = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
        nums = new Set(Array.from({ length: 12 }, () => Number(shuffle(rng, digits).join(''))));
    }
    const list = [...nums].slice(0, level === 1 ? 3 : 4);
    const big = rng() < 0.5;
    const answer = big ? Math.max(...list) : Math.min(...list);
    return make(rng, big ? 'Attrape le plus grand nombre.' : 'Attrape le plus petit nombre.', fmt(answer), list.map(fmt));
}

function numDecompose(level, rng) {
    if (level === 1) {
        const [c, d, u] = [int(rng, 1, 9), int(rng, 1, 9), int(rng, 1, 9)];
        const n = c * 100 + d * 10 + u;
        return numeric(rng, `${c * 100} + ${d * 10} + ${u} = …`, n,
            [c * 100 + u * 10 + d, u * 100 + d * 10 + c, d * 100 + c * 10 + u, n + 10, n + 100, n - 10]);
    }
    if (level === 2) {
        const m = int(rng, 1, 9);
        const rest = shuffle(rng, [int(rng, 1, 9), int(rng, 1, 9), 0]); // one zero: 3 000 + 200 + 5
        const [c, d, u] = rest;
        const n = m * 1000 + c * 100 + d * 10 + u;
        const parts = [m * 1000, c * 100, d * 10, u].filter(Boolean).map(fmt).join(' + ');
        const perms = [[c, u, d], [d, c, u], [u, d, c], [d, u, c]].map(([x, y, z]) => m * 1000 + x * 100 + y * 10 + z);
        const squeezed = Number([m, c, d, u].filter(Boolean).join(''));
        return numeric(rng, `${parts} = …`, n, [...perms, squeezed, n + 1000]);
    }
    if (level === 4) {
        const n = int(rng, 1000, 9999);
        if (rng() < 0.5) return numeric(rng, `Écris en chiffres : ${inWords(n)}`, n, shuffle(rng, misread(n)));
        const [ask, count, digit, other] = rng() < 0.5
            ? ['centaines', Math.floor(n / 100), Math.floor(n / 100) % 10, Math.floor(n / 10)]
            : ['dizaines', Math.floor(n / 10), Math.floor(n / 10) % 10, Math.floor(n / 100)];
        return numeric(rng, `Dans ${fmt(n)}, combien y a-t-il de ${ask} en tout ?`, count, [digit, other, Math.floor(n / 1000), n]);
    }
    const digits = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
    const names = ['milliers', 'centaines', 'dizaines', 'unités'];
    const at = int(rng, 0, 3);
    return make(rng, `Dans ${fmt(Number(digits.join('')))}, quel est le chiffre des ${names[at]} ?`,
        String(digits[at]), digits.filter((_, i) => i !== at).map(String));
}

function numSuite(level, rng) {
    const after = rng() < 0.5;
    if (level === 1) {
        if (after) { const n = int(rng, 10, 98) * 10 + 9; return numeric(rng, `Quel nombre vient juste après ${n} ?`, n + 1, [n - 9, n + 11, n + 2]); }
        const n = int(rng, 11, 99) * 10;
        return numeric(rng, `Quel nombre vient juste avant ${n} ?`, n - 1, [n - 10, n + 1, n - 11]);
    }
    if (level === 2) {
        if (after) {
            const n = (rng() < 0.5 ? int(rng, 2, 9) * 1000 : int(rng, 11, 98) * 100 + 100) - 1;
            return numeric(rng, `Quel nombre vient juste après ${fmt(n)} ?`, n + 1, [n - 9, n + 1001, n + 11]);
        }
        const n = rng() < 0.5 ? int(rng, 2, 9) * 1000 : int(rng, 11, 99) * 100;
        return numeric(rng, `Quel nombre vient juste avant ${fmt(n)} ?`, n - 1, [n - 10, n - 901, n - 100]);
    }
    if (level === 4) {
        const st = pick(rng, [25, 50, 250, 500, -50, -250]);
        const abs = Math.abs(st);
        const first = st > 0 ? int(rng, 1, 7) * 1000 + abs * int(rng, 0, Math.floor(1000 / abs) - 1) : int(rng, 3, 9) * 1000 + abs * int(rng, 0, Math.floor(1000 / abs) - 1);
        const next = first + 3 * st;
        return numeric(rng, `Continue la suite : ${[0, 1, 2].map(i => fmt(first + i * st)).join(', ')}, …`, next, around(rng, next, [abs, 10, 100]));
    }
    const step = pick(rng, [10, 100, 1000, -10, -100]);
    const base = int(rng, 1, 8) * 1000;
    const start = { 10: base + int(rng, 1, 9) * 100 + 70, 100: base + 700, 1000: int(rng, 1, 5) * 1000 + int(rng, 1, 9) * 100, '-10': base + int(rng, 1, 9) * 100 + 20, '-100': base + 200 }[step];
    const terms = [0, 1, 2].map(i => start + i * step);
    const next = start + 3 * step;
    const abs = Math.abs(step);
    return numeric(rng, `Continue la suite : ${terms.map(fmt).join(', ')}, …`, next, around(rng, next, [abs, abs === 10 ? 100 : 10]));
}

// ---------------------------------------------------------------- Calcul mental

function calcAdd(level, rng) {
    let a, b;
    if (level === 4) {
        if (rng() < 0.5) { a = int(rng, 101, 899); b = int(rng, 12, 89); return numeric(rng, `${fmt(a)} + ${b} = …`, a + b, around(rng, a + b, [10, 1, 100])); }
        a = int(rng, 12, 69); b = int(rng, 12, 29);
        return numeric(rng, `… + ${b} = ${a + b}`, a, around(rng, a, [10, 1, 2]).concat([a + 2 * b]));
    }
    if (level === 1) { a = int(rng, 12, 88); b = int(rng, 3, 9); }
    else if (level === 2) { a = int(rng, 11, 79); b = pick(rng, [9, 10, 11, 19, 20, 21]); }
    else if (rng() < 0.5) { a = int(rng, 22, 178) * 5; b = int(rng, 2, 9) * 10; }
    else { a = int(rng, 15, 79); b = int(rng, 15, 79); }
    return numeric(rng, `${fmt(a)} + ${b} = …`, a + b, around(rng, a + b, [1, 10, 2]));
}

function calcSub(level, rng) {
    let a, b;
    if (level === 4) {
        const form = int(rng, 0, 2);
        if (form === 0) { a = int(rng, 52, 99); b = int(rng, 12, a - 21); return numeric(rng, `${a} − … = ${a - b}`, b, around(rng, b, [10, 1, 2]).concat([2 * a - b])); }
        if (form === 1) { a = int(rng, 120, 950); b = int(rng, 12, 89); return numeric(rng, `${fmt(a)} − ${b} = …`, a - b, around(rng, a - b, [10, 1, 100])); }
        a = 1000; b = int(rng, 11, 95) * 10;
        return numeric(rng, `${fmt(a)} − ${b} = …`, a - b, around(rng, a - b, [100, 10, 50]));
    }
    if (level === 1) {
        if (rng() < 0.5) { a = int(rng, 11, 20); b = int(rng, 2, 9); } else { a = int(rng, 21, 99); b = int(rng, 2, 9); }
    } else if (level === 2) {
        if (rng() < 0.5) { a = 100; b = int(rng, 1, 19) * 5; } else { a = int(rng, 31, 99); b = int(rng, 1, 3) * 10; }
    } else if (rng() < 0.5) { a = int(rng, 30, 99); b = pick(rng, [9, 11, 19]); }
    else { a = int(rng, 20, 90) * 10; b = int(rng, 2, 9) * 10; }
    return numeric(rng, `${fmt(a)} − ${b} = …`, a - b, around(rng, a - b, [1, 10, 2]));
}

const TABLES = { 1: [2, 5, 10], 2: [3, 4], 3: [6, 7, 8, 9] };
function calcTables(level, rng) {
    if (level === 4) { // missing factor and « combien de fois »: the start of division
        const t = int(rng, 3, 9), o = int(rng, 3, 9);
        const wrong = around(rng, o, [1, 2]).concat([t]).filter(x => x > 0);
        if (rng() < 0.5) return numeric(rng, `Dans ${t * o}, combien de fois ${t} ?`, o, wrong);
        return numeric(rng, rng() < 0.5 ? `… × ${t} = ${t * o}` : `${t} × … = ${t * o}`, o, wrong);
    }
    const t = pick(rng, TABLES[level]);
    const o = int(rng, 2, 9);
    const [x, y] = rng() < 0.5 ? [t, o] : [o, t];
    return numeric(rng, `${x} × ${y} = …`, t * o, shuffle(rng, [t * (o + 1), t * (o - 1), (t + 1) * o, (t - 1) * o, t * o + 1, t * o - 2]));
}

function calcDouble(level, rng) {
    if (level === 4) {
        const form = int(rng, 0, 3);
        if (form === 0) { const n = int(rng, 11, 99); return numeric(rng, `${n} × 10 = …`, n * 10, [n * 100, n + 10, n * 10 + 10]); }
        if (form === 1) { const n = int(rng, 11, 99); return numeric(rng, `${n} × 100 = …`, n * 100, [n * 10, n * 1000, n + 100]); }
        if (form === 2) { const n = int(rng, 3, 25) * 4; return numeric(rng, `Le quart de ${n}, c'est…`, n / 4, [n / 2, n / 4 + 1, n / 4 - 1, n * 4]); }
        const n = int(rng, 6, 40); return numeric(rng, `Le triple de ${n}, c'est…`, n * 3, [n * 2, n + 3, n * 3 + 10, n * 3 - 1]);
    }
    if (level === 1) { const n = int(rng, 6, 50); return numeric(rng, `Le double de ${n}, c'est…`, n * 2, shuffle(rng, [n * 2 + 2, n * 2 - 2, n + 2, n * 2 + 10])); }
    if (level === 2) { const n = int(rng, 6, 50) * 2; return numeric(rng, `La moitié de ${n}, c'est…`, n / 2, shuffle(rng, [n / 2 + 1, n / 2 - 1, n / 2 + 10, n * 2])); }
    if (rng() < 0.5) { const n = int(rng, 11, 100) * 5; return numeric(rng, `Le double de ${fmt(n)}, c'est…`, n * 2, around(rng, n * 2, [10, 100, 20])); }
    const n = int(rng, 3, 100) * 10;
    return numeric(rng, `La moitié de ${fmt(n)}, c'est…`, n / 2, around(rng, n / 2, [5, 10, 50]));
}

// ---------------------------------------------------------------- Mesures et géométrie

// No-break spaces: a time or a price never wraps between the number and its unit.
export const fmtTime = (h, m) => (m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${pad2(m)}`);
const fmtMin = (d) => `${d}${NBSP}min`;
function mesHeure(level, rng) {
    if (level === 4) return duration(rng);
    const h = int(rng, 1, 12);
    const m = level === 1 ? pick(rng, [0, 30]) : level === 2 ? pick(rng, [15, 45]) : pick(rng, [5, 10, 20, 25, 35, 40, 50, 55]);
    const wrap = (x) => ((x - 1 + 12) % 12) + 1;
    const wrong = [
        m ? fmtTime(m / 5, (h % 12) * 5) : fmtTime(wrap(h + 6), 0), // hands swapped
        fmtTime(wrap(h + 1), m), fmtTime(wrap(h - 1), m), fmtTime(h, (m + 30) % 60), fmtTime(h, (m + 15) % 60),
    ];
    return make(rng, 'Quelle heure est-il ?', fmtTime(h, m), shuffle(rng, wrong), { clock: { h, m } });
}

// Durations: when something ends, or how long a trip lasts (the minutes cross the hour).
function duration(rng) {
    const h = int(rng, 8, 17);
    const t = (x) => fmtTime(Math.floor(x / 60), x % 60);
    if (rng() < 0.5) {
        const m = int(rng, 1, 11) * 5, d = pick(rng, [15, 20, 25, 30, 35, 40, 45, 50]);
        const end = h * 60 + m + d;
        const [what, verb, it] = pick(rng, [['Le film', 'dure', 'il'], ['La récréation', 'dure', 'elle'], ['Le match', 'dure', 'il'], ['La cuisson du gâteau', 'dure', 'elle']]);
        return make(rng, `${what} commence à ${fmtTime(h, m)} et ${verb} ${d} min. À quelle heure finit-${it} ?`,
            t(end), shuffle(rng, [t(end + 10), t(end - 10), t(end + 60), fmtTime(h, end % 60)]));
    }
    const m = int(rng, 6, 11) * 5;
    const d = int(rng, Math.ceil((65 - m) / 5), 11) * 5; // m + d > 60: the trip crosses the hour
    const end = h * 60 + m + d;
    // 10 h 15 − 9 h 40 done like 1015 − 940 gives d + 40: the classic mistake
    return make(rng, `Je pars à ${fmtTime(h, m)} et j'arrive à ${t(end)}. Le trajet dure…`, fmtMin(d),
        shuffle(rng, [d + 40, d + 10, d - 10, d + 60].filter(x => x > 0)).map(fmtMin));
}

export const fmtMoney = (c) => (c < 100 ? `${c}${NBSP}c` : c % 100 === 0 ? `${c / 100}${NBSP}€` : `${Math.floor(c / 100)}${NBSP}€${NBSP}${pad2(c % 100)}`);
function mesMonnaie(level, rng) {
    if (level === 1) {
        let coins;
        do coins = [0, 1, 2].map(() => pick(rng, [50, 20, 10, 5])); while (coins.reduce((s, c) => s + c, 0) >= 100);
        const sum = coins.reduce((s, c) => s + c, 0);
        return make(rng, `${coins.map(c => `${c} c`).join(' + ')} = …`, fmtMoney(sum), around(rng, sum, [10, 5, 20]).filter(c => c > 0 && c < 100).map(fmtMoney));
    }
    if (level === 2) {
        const e = int(rng, 1, 4);
        const coins = shuffle(rng, [50, 20, 10, 5]).slice(0, 2);
        const sum = e * 100 + coins[0] + coins[1];
        return make(rng, `${e} € + ${coins[0]} c + ${coins[1]} c = …`, fmtMoney(sum), [sum + 10, sum - 10, sum + 100, sum + 5].map(fmtMoney));
    }
    if (level === 4) { // two steps: add the prices, then the change
        const [x, y] = shuffle(rng, [['Un livre', 'un livre'], ['Un stylo', 'un stylo'], ['Une gomme', 'une gomme'], ['Un cahier', 'un cahier'], ['Une glace', 'une glace'], ['Un ballon', 'un ballon'], ['Une BD', 'une BD']]).slice(0, 2);
        const a = int(rng, 15, 69) * 10, b = int(rng, 5, 29) * 10;
        const bill = a + b < 1000 ? 1000 : 2000;
        const back = bill - a - b;
        return make(rng, `${x[0]} coûte ${fmtMoney(a)} et ${y[1]} ${fmtMoney(b)}. Je paie avec un billet de ${fmtMoney(bill)}. On me rend…`, fmtMoney(back),
            shuffle(rng, [bill - a, bill - b, back + 100, back - 100, back + 10, a + b].filter(c => c > 0 && c !== back)).map(fmtMoney));
    }
    const bill = pick(rng, [500, 1000]);
    const price = bill === 500 ? int(rng, 11, 48) * 10 : int(rng, 52, 95) * 10;
    const back = bill - price;
    return make(rng, `Je paie ${fmtMoney(price)} avec un billet de ${fmtMoney(bill)}. On me rend…`, fmtMoney(back),
        shuffle(rng, [back + 100, back - 100, back + 10, back - 10, price].filter(c => c > 0)).map(fmtMoney));
}

const UNIT_FACTS = [
    [1, '1 m = … cm', '100', '10', '1 000'], [1, '1 km = … m', '1 000', '100', '10'], [1, '1 kg = … g', '1 000', '100', '10'],
    [1, '1 h = … min', '60', '100', '30'], [1, '1 € = … c', '100', '10', '1 000'], [1, '1 cm = … mm', '10', '100', '1 000'],
    [2, 'Une demi-heure = … min', '30', '50', '15'], [2, "Un quart d'heure = … min", '15', '25', '30'], [2, '2 h = … min', '120', '200', '60'],
    [3, 'Une fourmi mesure environ 5 …', 'mm', 'cm', 'm'], [3, 'La classe mesure environ 8 … de long.', 'm', 'cm', 'km'],
    [3, 'Entre Paris et Lyon, il y a environ 460 …', 'km', 'm', 'cm'], [3, 'Un crayon mesure environ 15 …', 'cm', 'mm', 'm'],
    [3, 'Une pomme pèse environ 150 …', 'g', 'kg', 'cm'], [3, 'Un chien pèse environ 20 …', 'kg', 'g', 'km'],
    [3, "Une bouteille d'eau contient environ 1 …", 'L', 'cm', 'm'], [3, 'Une porte mesure environ 2 … de haut.', 'm', 'cm', 'km'],
];
const GEO_TOOLS = [
    [4, 'Pour tracer un cercle, on utilise…', 'un compas', 'une équerre', 'une règle'],
    [4, 'Pour vérifier un angle droit, on utilise…', 'une équerre', 'un compas', 'un crayon'],
    [4, 'Un carré a … axes de symétrie.', '4', '2', '1', '0'],
];
function geoFormes(level, rng) {
    if (level !== 4 || rng() < 0.3) return bank(level === 4 ? GEO_TOOLS : GEO)(level, rng);
    const cm = (n) => `${n}${NBSP}cm`;
    if (rng() < 0.5) {
        const c = int(rng, 3, 12);
        return make(rng, `Un carré a des côtés de ${c} cm. Son périmètre est…`, cm(4 * c), [2 * c, 3 * c, c * c, 4 * c + 4].filter(x => x !== 4 * c).map(cm));
    }
    const L = int(rng, 5, 12), l = int(rng, 2, L - 1);
    const p = 2 * (L + l);
    return make(rng, `Un rectangle mesure ${L} cm de long et ${l} cm de large. Son périmètre est…`, cm(p), [L + l, L * l, 2 * L + l, p + 2].filter(x => x !== p).map(cm));
}

function mesUnites(level, rng) {
    if (level === 4) {
        const [big, small, f] = pick(rng, [['m', 'cm', 100], ['km', 'm', 1000], ['kg', 'g', 1000], ['h', 'min', 60]]);
        const k = int(rng, 1, 5);
        const r = f === 60 ? int(rng, 1, 11) * 5 : f === 100 ? int(rng, 5, 95) : int(rng, 1, 9) * pick(rng, [10, 50, 100]);
        const n = k * f + r;
        const glued = Number(`${k}${r}`);
        return numeric(rng, `${k} ${big} ${r} ${small} = … ${small}`, n, [glued, k * f * 10 + r, n + f, k + r, k * 100 + r].filter(x => x !== n));
    }
    if (level === 2 && rng() < 0.7) {
        const k = int(rng, 2, 9);
        const [from, to, f] = pick(rng, [['m', 'cm', 100], ['km', 'm', 1000], ['kg', 'g', 1000], ['cm', 'mm', 10]]);
        return numeric(rng, `${k} ${from} = … ${to}`, k * f, [k * f * 10, (k * f) / 10, k * f + f]);
    }
    const [, prompt, answer, ...wrong] = pick(rng, UNIT_FACTS.filter(i => i[0] === level));
    return make(rng, prompt, answer.replace(' ', NBSP), wrong.map(w => w.replace(' ', NBSP)));
}

const bank = (items) => (level, rng) => {
    const [, prompt, answer, ...wrong] = pick(rng, items.filter(i => i[0] === level));
    return make(rng, prompt, answer, shuffle(rng, wrong));
};

const GEO = [
    [1, 'Un triangle a … côtés.', '3', '4', '5'], [1, 'Un carré a … côtés.', '4', '3', '6'], [1, 'Un rectangle a … angles droits.', '4', '2', '3'],
    [1, 'Un triangle a … sommets.', '3', '4', '6'], [1, 'Un carré a … angles droits.', '4', '2', '0'],
    [2, 'Un pentagone a … côtés.', '5', '6', '4'], [2, 'Un hexagone a … côtés.', '6', '5', '8'], [2, 'Un cube a … faces.', '6', '4', '8'],
    [2, 'Quelle figure a 4 côtés égaux et 4 angles droits ?', 'le carré', 'le rectangle', 'le triangle', 'le cercle'],
    [2, 'Quelle figure a 3 côtés ?', 'le triangle', 'le carré', 'le cercle'],
    [3, 'Un cube a … sommets.', '8', '6', '12'], [3, 'Un cube a … arêtes.', '12', '8', '6'], [3, 'Un pavé droit a … faces.', '6', '8', '4'],
    [3, 'Un polygone à 4 côtés est un…', 'quadrilatère', 'triangle', 'pentagone'],
    [3, "Le trait qui va du centre au bord d'un cercle est le…", 'rayon', 'diamètre', 'côté'],
];

// ---------------------------------------------------------------- Conjugaison

const ER = ['chanter', 'jouer', 'parler', 'danser', 'sauter', 'regarder', 'marcher', 'dessiner', 'aimer', 'trouver',
    'donner', 'porter', 'écouter', 'laver', 'tomber', 'rêver', 'fermer', 'gagner', 'cacher', 'chercher'];
const IRREGULAR = {
    'être': { p: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'], f: 'ser', i: 'ét' },
    avoir: { p: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], f: 'aur', i: 'av' },
    aller: { p: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'], f: 'ir', i: 'all' },
    faire: { p: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'], f: 'fer', i: 'fais' },
    dire: { p: ['dis', 'dis', 'dit', 'disons', 'dites', 'disent'], f: 'dir', i: 'dis' },
    venir: { p: ['viens', 'viens', 'vient', 'venons', 'venez', 'viennent'], f: 'viendr', i: 'ven' },
    pouvoir: { p: ['peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent'], f: 'pourr', i: 'pouv' },
    voir: { p: ['vois', 'vois', 'voit', 'voyons', 'voyez', 'voient'], f: 'verr', i: 'voy' },
    vouloir: { p: ['veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent'], f: 'voudr', i: 'voul' },
    prendre: { p: ['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'], f: 'prendr', i: 'pren' },
};
const VERBS_BY_LEVEL = { 1: ER, 2: ['être', 'avoir', 'aller'], 3: ['faire', 'dire', 'venir', 'pouvoir', 'voir', 'vouloir', 'prendre'] };
const ENDINGS = { p: ['e', 'es', 'e', 'ons', 'ez', 'ent'], f: ['ai', 'as', 'a', 'ons', 'ez', 'ont'], i: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'] };
const PRONOUNS = [['Je'], ['Tu'], ['Il', 'Elle', 'On'], ['Nous'], ['Vous'], ['Ils', 'Elles']];
const VOWEL = /^[aeiouyéèêàâîôû]/i;

// The six forms of a verb in a tense: 'p' présent, 'f' futur, 'i' imparfait.
export function conjugate(verb, tense) {
    const irr = IRREGULAR[verb];
    if (tense === 'p') return irr ? irr.p : ENDINGS.p.map(e => verb.slice(0, -2) + e);
    if (tense === 'f') return ENDINGS.f.map(e => (irr ? irr.f : verb) + e);
    return ENDINGS.i.map(e => (irr ? irr.i : verb.slice(0, -2)) + e);
}

const conj = (tense, label) => (level, rng) => {
    const verb = pick(rng, VERBS_BY_LEVEL[level]);
    const person = int(rng, 0, 5);
    const forms = conjugate(verb, tense);
    const answer = forms[person];
    const others = shuffle(rng, [...new Set(forms)].filter(f => f !== answer));
    const otherTense = conjugate(verb, tense === 'p' ? 'i' : 'p')[person];
    const subject = person === 0 && VOWEL.test(answer) ? 'J’' : `${pick(rng, PRONOUNS[person])} `;
    return make(rng, `${label} : ${subject}___ (${verb})`, answer, [others[0], others[1], otherTense]);
};

const TEMPS = [
    [1, 'Hier, nous jouions au parc.', 'passé'], [1, 'Demain, tu iras à la piscine.', 'futur'], [1, 'En ce moment, il pleut.', 'présent'],
    [1, "L'an dernier, j'étais en CE1.", 'passé'], [1, 'Plus tard, je serai pompier.', 'futur'], [1, "Aujourd'hui, nous mangeons à la cantine.", 'présent'],
    [1, 'La semaine prochaine, vous partirez.', 'futur'], [1, 'Autrefois, les rois vivaient dans des châteaux.', 'passé'], [1, 'Maintenant, vous écoutez.', 'présent'],
    [2, 'Le chat dormait sur le canapé.', 'passé'], [2, 'Nous prendrons le train.', 'futur'], [2, 'Elle dessine un dragon.', 'présent'],
    [2, 'Tu as fini ton dessin.', 'passé'], [2, 'Ils viendront ce soir.', 'futur'], [2, "J'ai perdu une dent.", 'passé'],
    [2, 'Vous chantiez très fort.', 'passé'], [2, 'Je range ma chambre.', 'présent'], [2, 'Tu auras neuf ans.', 'futur'],
];
function conjTemps(level, rng) {
    const [, sentence, answer] = pick(rng, TEMPS.filter(i => i[0] === level));
    return make(rng, `« ${sentence} » Cette phrase est au…`, answer, ['passé', 'présent', 'futur']);
}

// ---------------------------------------------------------------- Grammaire

// [level, sentence with the asked word in capitals, word, nature]
const NATURE = [
    [1, 'Le chat DORT sur le lit.', 'verbe'], [1, 'Le CHAT dort sur le lit.', 'nom'], [1, 'Léa MANGE une pomme.', 'verbe'],
    [1, 'Léa mange une POMME.', 'nom'], [1, 'Les oiseaux CHANTENT.', 'verbe'], [1, 'Mon FRÈRE joue au ballon.', 'nom'],
    [1, 'Nous REGARDONS un film.', 'verbe'], [1, 'La MAÎTRESSE écrit au tableau.', 'nom'], [1, 'Le chien COURT dans le jardin.', 'verbe'],
    [1, 'Papa prépare le REPAS.', 'nom'],
    [2, 'Le PETIT chat dort.', 'adjectif'], [2, 'LE chat dort.', 'déterminant'], [2, 'Elle porte une robe ROUGE.', 'adjectif'],
    [2, 'MES amis arrivent.', 'déterminant'], [2, 'Tu as un GRAND vélo.', 'adjectif'], [2, 'UNE fille saute à la corde.', 'déterminant'],
    [2, 'La soupe est CHAUDE.', 'adjectif'], [2, 'Je range CES livres.', 'déterminant'], [2, 'Un vent FROID souffle.', 'adjectif'],
    [2, 'Il prend SON cartable.', 'déterminant'],
    [3, 'ELLE chante très bien.', 'pronom'], [3, 'NOUS partons en vacances.', 'pronom'], [3, 'Demain, ILS iront au parc.', 'pronom'],
    [3, 'Le vieux chêne PERD ses feuilles.', 'verbe'], [3, 'La PEUR le fait trembler.', 'nom'], [3, 'Cette histoire est DRÔLE.', 'adjectif'],
    [3, 'TU ranges ta chambre.', 'pronom'], [3, 'Il aime la DANSE.', 'nom'], [3, 'Elle DANSE avec moi.', 'verbe'],
];
function gramNature(level, rng) {
    const [, sentence, answer] = pick(rng, NATURE.filter(i => i[0] === level));
    const word = sentence.match(/[A-ZÀ-Ý]{2,}/)[0];
    const natures = level === 1 ? ['nom', 'verbe', 'adjectif'] : level === 2 ? ['nom', 'verbe', 'adjectif', 'déterminant'] : ['nom', 'verbe', 'adjectif', 'pronom'];
    return make(rng, `« ${sentence} » ${word} est un…`, answer, shuffle(rng, natures));
}

const SUJET = [
    [1, 'Le chat boit du lait.', 'Le chat', 'boit', 'du lait'], [1, 'Les enfants jouent dans la cour.', 'Les enfants', 'jouent', 'la cour'],
    [1, 'Maman lit un livre.', 'Maman', 'lit', 'un livre'], [1, 'Tu manges une glace.', 'Tu', 'manges', 'une glace'],
    [1, 'Le train arrive à la gare.', 'Le train', 'arrive', 'la gare'], [1, 'Nous chantons une chanson.', 'Nous', 'chantons', 'une chanson'],
    [2, 'Ce matin, Paul prend le bus.', 'Paul', 'Ce matin', 'le bus'], [2, 'Dans le jardin, les fleurs poussent.', 'les fleurs', 'le jardin', 'poussent'],
    [2, 'Le chien de Tom aboie fort.', 'Le chien de Tom', 'Tom', 'aboie'], [2, 'Chaque soir, mon père cuisine.', 'mon père', 'Chaque soir', 'cuisine'],
    [2, 'Demain, vous irez à la piscine.', 'vous', 'Demain', 'la piscine'],
    [3, 'Dans le ciel volent des oiseaux.', 'des oiseaux', 'le ciel', 'volent'], [3, 'Où vas-tu ?', 'tu', 'Où', 'vas'],
    [3, 'Sur la branche chante un merle.', 'un merle', 'la branche', 'chante'], [3, 'Que mangent les lapins ?', 'les lapins', 'Que', 'mangent'],
];
// Level 4: which subject pronoun can replace a group (« Léa et Tom » → ils).
const PRONOMS = [
    ['Léa et Tom', 'ils'], ['Les filles', 'elles'], ['Mon frère et moi', 'nous'], ['Ta sœur et toi', 'vous'],
    ['Le vieux chien', 'il'], ['La maîtresse', 'elle'], ['Emma et Zoé', 'elles'], ['Mes parents', 'ils'],
    ['Toi et ton ami', 'vous'], ['Papa et moi', 'nous'], ['Ma grand-mère', 'elle'], ['Le train de nuit', 'il'],
];
function gramSujet(level, rng) {
    if (level === 4) {
        const [group, answer] = pick(rng, PRONOMS);
        return make(rng, `Quel pronom peut remplacer « ${group} » ?`, answer, shuffle(rng, ['il', 'elle', 'ils', 'elles', 'nous', 'vous']));
    }
    const [, sentence, answer, ...wrong] = pick(rng, SUJET.filter(i => i[0] === level));
    return make(rng, `« ${sentence} » Quel est le sujet du verbe ?`, answer, wrong);
}

// ---------------------------------------------------------------- Orthographe

const HOMOPHONES = [
    [1, 'Il ___ un vélo rouge.', 'a', 'à'], [1, "Je vais ___ l'école.", 'à', 'a'], [1, 'Léa ___ faim.', 'a', 'à'],
    [1, 'Nous jouons ___ la balle.', 'à', 'a'], [1, 'Le chat ___ soif.', 'a', 'à'], [1, 'Il habite ___ Paris.', 'à', 'a'],
    [1, 'Le ciel ___ bleu.', 'est', 'et'], [1, "J'ai un chat ___ un chien.", 'et', 'est'], [1, 'Elle ___ en retard.', 'est', 'et'],
    [1, "J'ai un stylo ___ une gomme.", 'et', 'est'], [1, 'Mon frère ___ grand.', 'est', 'et'], [1, 'Je mange du pain ___ du beurre.', 'et', 'est'],
    [2, '___ joue dans la cour.', 'On', 'Ont'], [2, 'Ils ___ un chien.', 'ont', 'on'], [2, 'Les filles ___ gagné.', 'ont', 'on'],
    [2, 'Ce soir, ___ mange des crêpes.', 'on', 'ont'], [2, 'Mes amis ___ froid.', 'ont', 'on'], [2, '___ va à la plage.', 'On', 'Ont'],
    [2, 'Il range ___ cartable.', 'son', 'sont'], [2, 'Les enfants ___ contents.', 'sont', 'son'], [2, 'Elle aime ___ chat.', 'son', 'sont'],
    [2, 'Mes chaussures ___ mouillées.', 'sont', 'son'], [2, 'Où ___ mes clés ?', 'sont', 'son'], [2, 'Tom prête ___ vélo.', 'son', 'sont'],
    [3, '___ habites-tu ?', 'Où', 'Ou'], [3, 'Tu veux une pomme ___ une poire ?', 'ou', 'où'], [3, 'Je sais ___ il se cache.', 'où', 'ou'],
    [3, 'Fromage ___ dessert ?', 'ou', 'où'], [3, 'Voici la ville ___ je suis né.', 'où', 'ou'], [3, 'Lundi ___ mardi ?', 'ou', 'où'],
    [4, 'Il ___ lavé les mains.', "s'est", "c'est"], [4, '___ mon meilleur ami.', "C'est", "S'est"], [4, 'Elle ___ cachée sous le lit.', "s'est", "c'est"],
    [4, "___ l'heure de manger.", "C'est", "S'est"], [4, 'Je range ___ crayons.', 'mes', 'mais'], [4, 'Il pleut, ___ je sors quand même.', 'mais', 'mes'],
    [4, "J'aime ___ cousins.", 'mes', 'mais'], [4, 'Il est petit ___ fort.', 'mais', 'mes'], [4, "Il ___ cache derrière l'arbre.", 'se', 'ce'],
    [4, '___ chien est très gentil.', 'Ce', 'Se'], [4, 'Elle ___ brosse les dents.', 'se', 'ce'], [4, "J'adore ___ dessin.", 'ce', 'se'],
];

// [level, singular with its article, plural, wrong spellings]
const PLURIEL = [
    [1, 'un chat', 'chats', 'chatx', 'chates'], [1, 'une fleur', 'fleurs', 'fleurx', 'fleures'], [1, 'un livre', 'livres', 'livrex', 'livre'],
    [1, 'un bateau', 'bateaux', 'bateaus', 'bateauxs'], [1, 'un gâteau', 'gâteaux', 'gâteaus', 'gâteaues'], [1, 'un oiseau', 'oiseaux', 'oiseaus', 'oiseaues'],
    [2, 'un cheval', 'chevaux', 'chevals', 'chevaus'], [2, 'un journal', 'journaux', 'journals', 'journaus'], [2, 'un animal', 'animaux', 'animals', 'animaus'],
    [2, 'un jeu', 'jeux', 'jeus', 'jeues'], [2, 'un cheveu', 'cheveux', 'cheveus', 'cheveuxs'], [2, 'une souris', 'souris', 'sourises', 'sourix'],
    [2, 'un nez', 'nez', 'nezs', 'nezes'], [2, 'un feu', 'feux', 'feus', 'feues'],
    [3, 'un bijou', 'bijoux', 'bijous', 'bijoues'], [3, 'un caillou', 'cailloux', 'caillous', 'cailloues'], [3, 'un genou', 'genoux', 'genous', 'genoues'],
    [3, 'un clou', 'clous', 'cloux', 'cloues'], [3, 'un trou', 'trous', 'troux', 'troues'], [3, 'un bal', 'bals', 'baux', 'bales'],
    [3, 'un pneu', 'pneus', 'pneux', 'pneues'], [3, 'un prix', 'prix', 'prixs', 'prixes'], [3, 'un hibou', 'hiboux', 'hibous', 'hiboues'],
    [3, 'un chou', 'choux', 'chous', 'choues'],
    [4, 'un travail', 'travaux', 'travaus', 'travailx'], [4, 'un œil', 'yeux', 'œils', 'yeus'], [4, 'un vitrail', 'vitraux', 'vitrails', 'vitraus'],
    [4, 'un rail', 'rails', 'raux', 'railx'], [4, 'un détail', 'détails', 'détaux', 'détailx'], [4, 'un éventail', 'éventails', 'éventaux', 'éventailx'],
    [4, 'un corail', 'coraux', 'corails', 'coraus'], [4, 'un bocal', 'bocaux', 'bocals', 'bocaus'], [4, 'un festival', 'festivals', 'festivaux', 'festivales'],
    [4, 'un carnaval', 'carnavals', 'carnavaux', 'carnavales'], [4, 'un chacal', 'chacals', 'chacaux', 'chacales'],
];
function orthPluriel(level, rng) {
    const [, singular, answer, ...wrong] = pick(rng, PLURIEL.filter(i => i[0] === level));
    return make(rng, `${singular} → des …`, answer, wrong);
}

const ACCORD = [
    [1, 'une ___ fille', 'petite', 'petit', 'petits'], [1, 'un ___ garçon', 'petit', 'petite', 'petites'], [1, 'des chats ___', 'noirs', 'noir', 'noire'],
    [1, 'une robe ___', 'verte', 'vert', 'verts'], [1, 'un ballon ___', 'rond', 'ronde', 'ronds'],
    [2, 'des fleurs ___', 'bleues', 'bleus', 'bleue'], [2, 'les ___ maisons', 'grandes', 'grands', 'grande'], [2, 'des pommes ___', 'mûres', 'mûrs', 'mûre'],
    [2, 'mes ___ amis', 'meilleurs', 'meilleur', 'meilleures'], [2, 'une histoire ___', 'amusante', 'amusant', 'amusants'],
    [3, 'Les enfants ___ dans la cour.', 'jouent', 'joue', 'joues'], [3, 'Le chien ___ très fort.', 'aboie', 'aboient', 'aboies'],
    [3, 'Mes sœurs ___ une chanson.', 'chantent', 'chante', 'chantes'], [3, 'Tu ___ ton goûter.', 'manges', 'mange', 'mangent'],
    [3, 'Les oiseaux ___ haut.', 'volent', 'vole', 'voles'], [3, 'Papa et maman ___ au marché.', 'vont', 'va', 'vas'],
    [4, 'Les chiens de ma voisine ___.', 'aboient', 'aboie', 'aboies'], [4, 'Le chat des voisins ___ sur le mur.', 'dort', 'dorment', 'dors'],
    [4, 'Mes cousines sont ___.', 'gentilles', 'gentils', 'gentille'], [4, 'Les fleurs du jardin sont ___.', 'belles', 'beaux', 'belle'],
    [4, 'Le frère de mes amies ___ grand.', 'est', 'sont', 'es'], [4, 'Elles sont ___ de partir.', 'contentes', 'contents', 'contente'],
    [4, 'Ma sœur et moi ___ au parc.', 'jouons', 'jouent', 'joue'], [4, 'Les élèves de la classe ___.', 'chantent', 'chante', 'chantes'],
];

// ---------------------------------------------------------------- Lexique

const CONTRAIRES = [
    [1, 'grand', 'petit', 'gros', 'haut'], [1, 'chaud', 'froid', 'tiède', 'doux'], [1, 'jour', 'nuit', 'soir', 'matin'],
    [1, 'monter', 'descendre', 'grimper', 'sauter'], [1, 'ouvrir', 'fermer', 'pousser', 'entrer'], [1, 'rapide', 'lent', 'vite', 'pressé'],
    [1, 'plein', 'vide', 'lourd', 'rempli'],
    [2, 'gentil', 'méchant', 'aimable', 'sage'], [2, 'propre', 'sale', 'net', 'neuf'], [2, 'rire', 'pleurer', 'sourire', 'crier'],
    [2, 'commencer', 'finir', 'débuter', 'continuer'], [2, 'facile', 'difficile', 'simple', 'rapide'], [2, 'allumer', 'éteindre', 'éclairer', 'brûler'],
    [2, 'riche', 'pauvre', 'fortuné', 'cher'],
    [3, 'possible', 'impossible', 'probable', 'faisable'], [3, 'heureux', 'malheureux', 'joyeux', 'content'], [3, 'visible', 'invisible', 'clair', 'voyant'],
    [3, 'faire', 'défaire', 'refaire', 'parfaire'], [3, 'patient', 'impatient', 'calme', 'pressant'], [3, 'coller', 'décoller', 'recoller', 'encoller'],
];
const SYNONYMES = [
    [1, 'content', 'joyeux', 'triste', 'fâché'], [1, 'beau', 'joli', 'laid', 'sale'], [1, 'gentil', 'aimable', 'méchant', 'timide'],
    [1, 'finir', 'terminer', 'commencer', 'attendre'], [1, 'regarder', 'observer', 'écouter', 'toucher'], [1, 'casser', 'briser', 'réparer', 'coller'],
    [2, 'calme', 'tranquille', 'agité', 'bruyant'], [2, 'drôle', 'amusant', 'ennuyeux', 'sérieux'], [2, 'erreur', 'faute', 'réponse', 'vérité'],
    [2, 'chemin', 'sentier', 'rivière', 'forêt'], [2, 'fatigué', 'épuisé', 'reposé', 'réveillé'], [2, 'laver', 'nettoyer', 'salir', 'ranger'],
];
const FAMILLES = [
    [1, 'dent', 'dentiste', 'danse', 'dessin'], [1, 'lait', 'laitier', 'laine', 'laid'], [1, 'jardin', 'jardinier', 'janvier', 'jambon'],
    [1, 'chant', 'chanteur', 'champ', 'chance'], [1, 'fleur', 'fleuriste', 'fleuve', 'flèche'],
    [2, 'terre', 'enterrer', 'terrible', 'terminer'], [2, 'mer', 'marin', 'mère', 'merci'], [2, 'froid', 'refroidir', 'froisser', 'frotter'],
    [2, 'long', 'longueur', 'lundi', 'loin'], [2, 'grand', 'grandir', 'grange', 'gronder'], [2, 'lent', 'ralentir', 'lentille', 'lancer'],
    [2, 'courir', 'coureur', 'courage', 'couronne'],
];
const worded = (items, ask) => (level, rng) => {
    const [, word, answer, ...wrong] = pick(rng, items.filter(i => i[0] === level));
    return make(rng, ask(word), answer, wrong);
};

const ALPHA_GROUPS = [
    ['cabane', 'cerise', 'chat', 'chien', 'citron'], ['fleur', 'fromage', 'fusée', 'fourmi'], ['lapin', 'lion', 'lune', 'loup'],
    ['maison', 'mouton', 'miel', 'magie'], ['panda', 'pirate', 'poisson', 'pomme'], ['renard', 'robot', 'rivière', 'rue'],
    ['sapin', 'soleil', 'souris', 'serpent'], ['tigre', 'tortue', 'train', 'table'],
];
const ALPHA_SINGLES = ['abeille', 'banane', 'dragon', 'girafe', 'hibou', 'jardin', 'nuage', 'orange', 'vache', 'zèbre'];
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function lexAlpha(level, rng) {
    let words;
    if (level === 1) words = shuffle(rng, [...ALPHA_SINGLES, ...ALPHA_GROUPS.map(g => pick(rng, g))]).slice(0, 3);
    else words = shuffle(rng, pick(rng, ALPHA_GROUPS)).slice(0, level === 2 ? 3 : 4);
    const first = [...words].sort((a, b) => (plain(a) < plain(b) ? -1 : 1))[0];
    return make(rng, 'Quel mot vient en premier dans le dictionnaire ?', first, words);
}

// ---------------------------------------------------------------- Anglais (first year, pre-A1)
// Instructions are in French at levels 1 and 2 (he is a beginner), in English at level 3. British English (« grey »,
// « mum »). Each list is one word per meaning, so a distractor taken from the same list is never also right.

const EN_COLOURS = [['rouge', 'red'], ['bleu', 'blue'], ['vert', 'green'], ['jaune', 'yellow'], ['noir', 'black'], ['blanc', 'white'],
    ['orange', 'orange'], ['rose', 'pink'], ['violet', 'purple'], ['marron', 'brown'], ['gris', 'grey']];
// [emoji, colour, wrong colours]: the wrong ones are never a colour the picture also has (no green for a carrot).
const EN_COLOUR_OF = [
    ['🍌', 'yellow', 'blue', 'black', 'pink'], ['🐸', 'green', 'red', 'white', 'pink'], ['🍓', 'red', 'blue', 'grey', 'purple'],
    ['🥕', 'orange', 'blue', 'pink', 'white'], ['🐷', 'pink', 'green', 'blue', 'black'], ['🍆', 'purple', 'yellow', 'orange', 'white'],
    ['🥛', 'white', 'red', 'green', 'orange'], ['🐘', 'grey', 'red', 'yellow', 'green'], ['🐻', 'brown', 'green', 'blue', 'pink'],
    ['❤️', 'red', 'blue', 'green', 'yellow'], ['💙', 'blue', 'red', 'yellow', 'brown'], ['💚', 'green', 'red', 'pink', 'black'],
    ['💛', 'yellow', 'blue', 'black', 'purple'], ['💜', 'purple', 'green', 'yellow', 'orange'], ['🖤', 'black', 'white', 'yellow', 'pink'],
    ['🌳', 'green', 'blue', 'pink', 'purple'],
];
const EN_MIXES = [
    ['Red and white make…', 'pink', 'green', 'blue', 'black'], ['Blue and yellow make…', 'green', 'red', 'pink', 'white'],
    ['Red and yellow make…', 'orange', 'blue', 'green', 'grey'], ['Black and white make…', 'grey', 'red', 'yellow', 'green'],
    ['Red and blue make…', 'purple', 'yellow', 'green', 'white'],
];
// Three other entries of the same list, as wrong answers.
const others = (rng, list, item) => shuffle(rng, list.filter(x => x !== item)).slice(0, 3);
function enCouleurs(level, rng) {
    if (level === 1) {
        const c = pick(rng, EN_COLOURS);
        return make(rng, `Comment dit-on « ${c[0]} » en anglais ?`, c[1], others(rng, EN_COLOURS, c).map(x => x[1]));
    }
    if (level === 3 && rng() < 0.3) { const [prompt, answer, ...wrong] = pick(rng, EN_MIXES); return make(rng, prompt, answer, wrong); }
    const [emoji, answer, ...wrong] = pick(rng, EN_COLOUR_OF);
    return make(rng, level === 2 ? `En anglais, de quelle couleur est ${emoji} ?` : `What colour is ${emoji}?`, answer, wrong);
}

const EN_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const EN_TENS = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety' };
const EN_COUNT = [['🍎', 'apples'], ['⭐', 'stars'], ['🐟', 'fish'], ['🎈', 'balloons'], ['🐱', 'cats']];
function enNombres(level, rng) {
    if (level === 1) {
        const n = int(rng, 1, 10);
        const near = shuffle(rng, [n - 2, n - 1, n + 1, n + 2].filter(x => x >= 1 && x <= 10)).slice(0, 3);
        return make(rng, `Comment dit-on ${n} en anglais ?`, EN_NUMBERS[n], near.map(x => EN_NUMBERS[x]));
    }
    if (level === 2) {
        const n = int(rng, 11, 20);
        const next = EN_NUMBERS[n === 20 ? 19 : n + 1];
        // thirteen / thirty: the confusion to learn
        const tens = n >= 13 && n <= 19 ? EN_TENS[n - 10] : EN_NUMBERS[n === 20 ? 12 : n - 10];
        if (rng() < 0.5) return make(rng, `Comment dit-on ${n} en anglais ?`, EN_NUMBERS[n], [tens, next, EN_NUMBERS[n - 10]]);
        return make(rng, `Quel nombre est « ${EN_NUMBERS[n]} » ?`, String(n), [n >= 13 ? (n - 10) * 10 : n + 1, n - 10, n === 20 ? 12 : n + 1, n - 1].map(String));
    }
    if (rng() < 0.5) {
        const n = int(rng, 3, 12);
        const [emoji, name] = pick(rng, EN_COUNT);
        return make(rng, `How many ${name}? ${emoji.repeat(n)}`, EN_NUMBERS[n], shuffle(rng, [n - 1, n + 1, n + 2, n - 2]).map(x => EN_NUMBERS[x]));
    }
    const a = int(rng, 2, 9), b = int(rng, 2, 9);
    return make(rng, `What is ${EN_NUMBERS[a]} plus ${EN_NUMBERS[b]}?`, EN_NUMBERS[a + b], shuffle(rng, [a + b - 1, a + b + 1, a + b - 2, Math.abs(a - b)].filter(x => x !== a + b)).map(x => EN_NUMBERS[x]));
}

const EN_PETS = [['🐶', 'dog'], ['🐱', 'cat'], ['🐦', 'bird'], ['🐟', 'fish'], ['🐰', 'rabbit'], ['🐭', 'mouse']];
const EN_ANIMALS = [['🐴', 'horse'], ['🐮', 'cow'], ['🐷', 'pig'], ['🦆', 'duck'], ['🐑', 'sheep'], ['🦁', 'lion'], ['🐯', 'tiger'],
    ['🐻', 'bear'], ['🐵', 'monkey'], ['🐸', 'frog'], ['🐍', 'snake'], ['🐘', 'elephant']];
const EN_ANIMALS_FR = [['horse', 'le cheval'], ['cow', 'la vache'], ['pig', 'le cochon'], ['duck', 'le canard'], ['sheep', 'le mouton'],
    ['tiger', 'le tigre'], ['bear', "l'ours"], ['monkey', 'le singe'], ['frog', 'la grenouille'], ['snake', 'le serpent'],
    ['mouse', 'la souris'], ['rabbit', 'le lapin'], ['bird', "l'oiseau"]];
// Emoji → English word (French instruction), or English word → French.
const enPicture = (list) => (rng) => { const it = pick(rng, list); return make(rng, `En anglais, ${it[0]} se dit…`, it[1], others(rng, list, it).map(x => x[1])); };
const enToFrench = (list) => (rng) => { const it = pick(rng, list); return make(rng, `Que veut dire « ${it[0]} » ?`, it[1], others(rng, list, it).map(x => x[1])); };
const frToEnglish = (list) => (rng) => { const it = pick(rng, list); return make(rng, `Comment dit-on « ${it[0]} » en anglais ?`, it[1], others(rng, list, it).map(x => x[1])); };
const byLevel = (gens) => (level, rng) => gens[level - 1](rng);

const EN_THINGS = [['📖', 'book'], ['✏️', 'pencil'], ['📏', 'ruler'], ['✂️', 'scissors'], ['🍎', 'apple'], ['🍌', 'banana'],
    ['🥛', 'milk'], ['🍞', 'bread'], ['🧀', 'cheese'], ['🥚', 'egg'], ['🍰', 'cake']];
const EN_FAMILY = [['maman', 'mum'], ['papa', 'dad'], ['le frère', 'brother'], ['la sœur', 'sister'], ['la grand-mère', 'grandma'],
    ['le grand-père', 'grandpa'], ['le bébé', 'baby']];
const EN_SCHOOL = [['le stylo', 'pen'], ['la trousse', 'pencil case'], ['la maîtresse', 'teacher'], ["l'école", 'school'],
    ['le livre', 'book'], ['la règle', 'ruler'], ['le crayon', 'pencil']];
const EN_WORDS_FR = [['bread', 'le pain'], ['milk', 'le lait'], ['cheese', 'le fromage'], ['apple', 'la pomme'], ['egg', "l'œuf"],
    ['brother', 'le frère'], ['sister', 'la sœur'], ['pencil', 'le crayon'], ['ruler', 'la règle'], ['teacher', 'la maîtresse'],
    ['school', "l'école"], ['book', 'le livre']];

const EN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FR_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const day = (i) => EN_DAYS[(i + 7) % 7];
function enJours(level, rng) {
    const i = int(rng, 0, 6);
    if (level === 1) return make(rng, `Comment dit-on « ${FR_DAYS[i]} » en anglais ?`, EN_DAYS[i], shuffle(rng, EN_DAYS.filter((_, j) => j !== i)).slice(0, 3));
    if (level === 2) return make(rng, `Quel jour vient après ${EN_DAYS[i]} ?`, day(i + 1), [day(i), day(i - 1), day(i + 2)]);
    if (rng() < 0.5) return make(rng, `What day comes before ${EN_DAYS[i]}?`, day(i - 1), [day(i), day(i + 1), day(i - 2)]);
    return make(rng, `What day comes after ${EN_DAYS[i]}?`, day(i + 1), [day(i), day(i - 1), day(i + 2)]);
}

const EN_GREETINGS = [['bonjour', 'Hello'], ['au revoir', 'Goodbye'], ['merci', 'Thank you'], ["s'il te plaît", 'Please'],
    ['oui', 'Yes'], ['non', 'No'], ['bonne nuit', 'Good night']];
// [level, sentence or English sentence, answer, wrong answers]
const EN_PHRASES = [
    [2, 'My ___ is Tom.', 'name', 'old', 'am', 'are'], [2, 'I ___ eight years old.', 'am', 'is', 'are', 'have'],
    [2, 'It ___ a cat.', 'is', 'am', 'are', 'have'], [2, 'How ___ are you?', 'old', 'name', 'is', 'my'],
    [2, 'What is your ___?', 'name', 'old', 'am', 'are'], [2, 'I ___ fine, thank you.', 'am', 'is', 'are', 'has'],
    [2, 'You ___ my friend.', 'are', 'am', 'is', 'has'], [2, '___ name is Léa.', 'My', 'I', 'Am', 'Is'],
    [3, 'I am eight.', "J'ai huit ans", 'Il a huit ans', "J'ai neuf ans", "J'ai huit chats"],
    [3, 'My name is Tom.', "Je m'appelle Tom", "Il s'appelle Tom", 'Tom est mon ami'],
    [3, 'It is a dog.', "C'est un chien", "C'est un chat", "J'ai un chien"],
    [3, 'I have a sister.', "J'ai une sœur", "J'ai un frère", 'Il a une sœur'],
    [3, 'How are you?', 'Comment ça va ?', 'Quel âge as-tu ?', 'Où es-tu ?'],
    [3, 'How old are you?', 'Quel âge as-tu ?', 'Comment ça va ?', 'Qui es-tu ?'],
    [3, 'I like milk.', "J'aime le lait", "J'ai du lait", 'Je bois du lait'],
    [3, 'It is red.', "C'est rouge", "C'est vert", "C'est bleu"],
    [3, 'Good morning!', 'Bonjour', 'Bonne nuit', 'Au revoir'],
];
function enPhrases(level, rng) {
    if (level === 1) return frToEnglish(EN_GREETINGS)(rng);
    const [, text, answer, ...wrong] = pick(rng, EN_PHRASES.filter(i => i[0] === level));
    return make(rng, level === 2 ? `Complète : ${text}` : `« ${text} » veut dire…`, answer, shuffle(rng, wrong));
}

// ---------------------------------------------------------------- Catalogue

export const SKILLS = [
    { id: 'num.compare', name: 'Comparer des nombres', levels: 4, gen: numCompare },
    { id: 'num.decompose', name: 'Décomposer, écrire un nombre', levels: 4, gen: numDecompose },
    { id: 'num.suite', name: 'Avant, après, suites', levels: 4, gen: numSuite },
    { id: 'calc.add', name: 'Additions de tête', levels: 4, gen: calcAdd },
    { id: 'calc.sub', name: 'Soustractions de tête', levels: 4, gen: calcSub },
    { id: 'calc.tables', name: 'Tables, combien de fois', levels: 4, gen: calcTables },
    { id: 'calc.double', name: 'Double, moitié, triple, quart', levels: 4, gen: calcDouble },
    { id: 'mes.heure', name: "L'heure et les durées", levels: 4, gen: mesHeure },
    { id: 'mes.monnaie', name: 'La monnaie', levels: 4, gen: mesMonnaie },
    { id: 'mes.unites', name: 'Les unités de mesure', levels: 4, gen: mesUnites },
    { id: 'geo.formes', name: 'Figures, solides, périmètres', levels: 4, gen: geoFormes },
    { id: 'conj.present', name: 'Le présent', levels: 3, gen: conj('p', 'Au présent') },
    { id: 'conj.futur', name: 'Le futur', levels: 3, gen: conj('f', 'Au futur') },
    { id: 'conj.imparfait', name: "L'imparfait", levels: 3, gen: conj('i', "À l'imparfait") },
    { id: 'conj.temps', name: 'Passé, présent, futur', levels: 2, gen: conjTemps },
    { id: 'gram.nature', name: 'La nature des mots', levels: 3, gen: gramNature },
    { id: 'gram.sujet', name: 'Le sujet du verbe', levels: 4, gen: gramSujet },
    { id: 'lex.contraire', name: 'Les contraires', levels: 3, gen: worded(CONTRAIRES, w => `Quel est le contraire de « ${w} » ?`) },
    { id: 'lex.synonyme', name: 'Les synonymes', levels: 2, gen: worded(SYNONYMES, w => `Quel mot veut dire la même chose que « ${w} » ?`) },
    { id: 'lex.famille', name: 'Les familles de mots', levels: 2, gen: worded(FAMILLES, w => `Quel mot est de la famille de « ${w} » ?`) },
    { id: 'lex.alpha', name: "L'ordre alphabétique", levels: 3, gen: lexAlpha },
    { id: 'orth.homophones', name: 'a/à, et/est, on/ont, son/sont, ou/où, c’est/s’est…', levels: 4, gen: bank(HOMOPHONES) },
    { id: 'orth.pluriel', name: 'Le pluriel des noms', levels: 4, gen: orthPluriel },
    { id: 'orth.accord', name: 'Les accords', levels: 4, gen: worded(ACCORD, w => `Complète : ${w}`) },
    { id: 'en.couleurs', name: 'Les couleurs', levels: 3, gen: enCouleurs },
    { id: 'en.nombres', name: 'Les nombres', levels: 3, gen: enNombres },
    { id: 'en.animaux', name: 'Les animaux', levels: 3, gen: byLevel([enPicture(EN_PETS), enPicture(EN_ANIMALS), enToFrench(EN_ANIMALS_FR)]) },
    { id: 'en.mots', name: 'Famille, école, repas', levels: 3, gen: byLevel([enPicture(EN_THINGS), (rng) => frToEnglish(rng() < 0.5 ? EN_FAMILY : EN_SCHOOL)(rng), enToFrench(EN_WORDS_FR)]) },
    { id: 'en.jours', name: 'Les jours', levels: 3, gen: enJours },
    { id: 'en.phrases', name: 'Petites phrases', levels: 3, gen: enPhrases },
];
for (const s of SKILLS) s.name = typo(s.name);
export const skillById = (id) => SKILLS.find(s => s.id === id);

// A question of that skill at that level (clamped to the skill's levels). `avoid` holds prompts already asked in
// the expedition: a few tries to find another one, then a repeat is accepted (small banks).
export function generate(skillId, level, rng, avoid = new Set()) {
    const skill = skillById(skillId);
    const lvl = Math.min(skill.levels, Math.max(1, level));
    let q;
    for (let i = 0; i < 12; i++) {
        q = skill.gen(lvl, rng);
        if (q.choices.length >= 2 && !avoid.has(q.prompt)) break;
    }
    return { skill: skillId, level: lvl, ...q };
}
