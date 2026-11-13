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

function numCompare(level, rng) {
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
    if (level === 1) { a = int(rng, 12, 88); b = int(rng, 3, 9); }
    else if (level === 2) { a = int(rng, 11, 79); b = pick(rng, [9, 10, 11, 19, 20, 21]); }
    else if (rng() < 0.5) { a = int(rng, 22, 178) * 5; b = int(rng, 2, 9) * 10; }
    else { a = int(rng, 15, 79); b = int(rng, 15, 79); }
    return numeric(rng, `${fmt(a)} + ${b} = …`, a + b, around(rng, a + b, [1, 10, 2]));
}

function calcSub(level, rng) {
    let a, b;
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
    const t = pick(rng, TABLES[level]);
    const o = int(rng, 2, 9);
    const [x, y] = rng() < 0.5 ? [t, o] : [o, t];
    return numeric(rng, `${x} × ${y} = …`, t * o, shuffle(rng, [t * (o + 1), t * (o - 1), (t + 1) * o, (t - 1) * o, t * o + 1, t * o - 2]));
}

function calcDouble(level, rng) {
    if (level === 1) { const n = int(rng, 6, 50); return numeric(rng, `Le double de ${n}, c'est…`, n * 2, shuffle(rng, [n * 2 + 2, n * 2 - 2, n + 2, n * 2 + 10])); }
    if (level === 2) { const n = int(rng, 6, 50) * 2; return numeric(rng, `La moitié de ${n}, c'est…`, n / 2, shuffle(rng, [n / 2 + 1, n / 2 - 1, n / 2 + 10, n * 2])); }
    if (rng() < 0.5) { const n = int(rng, 11, 100) * 5; return numeric(rng, `Le double de ${fmt(n)}, c'est…`, n * 2, around(rng, n * 2, [10, 100, 20])); }
    const n = int(rng, 3, 100) * 10;
    return numeric(rng, `La moitié de ${fmt(n)}, c'est…`, n / 2, around(rng, n / 2, [5, 10, 50]));
}

// ---------------------------------------------------------------- Mesures et géométrie

// No-break spaces: a time or a price never wraps between the number and its unit.
export const fmtTime = (h, m) => (m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${pad2(m)}`);
function mesHeure(level, rng) {
    const h = int(rng, 1, 12);
    const m = level === 1 ? pick(rng, [0, 30]) : level === 2 ? pick(rng, [15, 45]) : pick(rng, [5, 10, 20, 25, 35, 40, 50, 55]);
    const wrap = (x) => ((x - 1 + 12) % 12) + 1;
    const wrong = [
        m ? fmtTime(m / 5, (h % 12) * 5) : fmtTime(wrap(h + 6), 0), // hands swapped
        fmtTime(wrap(h + 1), m), fmtTime(wrap(h - 1), m), fmtTime(h, (m + 30) % 60), fmtTime(h, (m + 15) % 60),
    ];
    return make(rng, 'Quelle heure est-il ?', fmtTime(h, m), shuffle(rng, wrong), { clock: { h, m } });
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
    const bill = pick(rng, [500, 1000]);
    const price = bill === 500 ? int(rng, 11, 48) * 10 : int(rng, 52, 95) * 10;
    const back = bill - price;
    return make(rng, `Je paie ${fmtMoney(price)} avec un billet de ${bill / 100} €. On me rend…`, fmtMoney(back),
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
function mesUnites(level, rng) {
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
function gramSujet(level, rng) {
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

// ---------------------------------------------------------------- Catalogue

export const SKILLS = [
    { id: 'num.compare', name: 'Comparer des nombres', levels: 3, gen: numCompare },
    { id: 'num.decompose', name: 'Décomposer un nombre', levels: 3, gen: numDecompose },
    { id: 'num.suite', name: 'Avant, après, suites', levels: 3, gen: numSuite },
    { id: 'calc.add', name: 'Additions de tête', levels: 3, gen: calcAdd },
    { id: 'calc.sub', name: 'Soustractions de tête', levels: 3, gen: calcSub },
    { id: 'calc.tables', name: 'Tables de multiplication', levels: 3, gen: calcTables },
    { id: 'calc.double', name: 'Doubles et moitiés', levels: 3, gen: calcDouble },
    { id: 'mes.heure', name: "Lire l'heure", levels: 3, gen: mesHeure },
    { id: 'mes.monnaie', name: 'La monnaie', levels: 3, gen: mesMonnaie },
    { id: 'mes.unites', name: 'Les unités de mesure', levels: 3, gen: mesUnites },
    { id: 'geo.formes', name: 'Figures et solides', levels: 3, gen: bank(GEO) },
    { id: 'conj.present', name: 'Le présent', levels: 3, gen: conj('p', 'Au présent') },
    { id: 'conj.futur', name: 'Le futur', levels: 3, gen: conj('f', 'Au futur') },
    { id: 'conj.imparfait', name: "L'imparfait", levels: 3, gen: conj('i', "À l'imparfait") },
    { id: 'conj.temps', name: 'Passé, présent, futur', levels: 2, gen: conjTemps },
    { id: 'gram.nature', name: 'La nature des mots', levels: 3, gen: gramNature },
    { id: 'gram.sujet', name: 'Le sujet du verbe', levels: 3, gen: gramSujet },
    { id: 'lex.contraire', name: 'Les contraires', levels: 3, gen: worded(CONTRAIRES, w => `Quel est le contraire de « ${w} » ?`) },
    { id: 'lex.synonyme', name: 'Les synonymes', levels: 2, gen: worded(SYNONYMES, w => `Quel mot veut dire la même chose que « ${w} » ?`) },
    { id: 'lex.famille', name: 'Les familles de mots', levels: 2, gen: worded(FAMILLES, w => `Quel mot est de la famille de « ${w} » ?`) },
    { id: 'lex.alpha', name: "L'ordre alphabétique", levels: 3, gen: lexAlpha },
    { id: 'orth.homophones', name: 'a/à, et/est, on/ont, son/sont, ou/où', levels: 3, gen: bank(HOMOPHONES) },
    { id: 'orth.pluriel', name: 'Le pluriel des noms', levels: 3, gen: orthPluriel },
    { id: 'orth.accord', name: 'Les accords', levels: 3, gen: worded(ACCORD, w => `Complète : ${w}`) },
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
