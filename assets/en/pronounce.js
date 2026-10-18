// assets/en/pronounce.js
// Pure: scores what the speech recogniser heard against the expected English, at a parent-chosen precision.
// The recogniser returns real words (it "corrects" toward its dictionary), so tolerance is applied to its output:
// a French-accented "sink" for "think" or "appy" for "happy" passes in Indulgent, not in Exigeant.

export const LEVELS = {
    // ratio: share of expected words that must be heard (sentences); words: how close a heard word must be.
    indulgent: { ratio: 0.6, words: 'lenient' },
    normal: { ratio: 0.8, words: 'phonetic' },
    exigeant: { ratio: 1, words: 'exact' },
};

const CONTRACTIONS = {
    "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "it's": 'it is', "he's": 'he is',
    "she's": 'she is', "what's": 'what is', "where's": 'where is', "who's": 'who is', "that's": 'that is',
    "there's": 'there is', "let's": 'let us', "i've": 'i have', "you've": 'you have', "we've": 'we have',
    "i'll": 'i will', "you'll": 'you will', "i'd": 'i would', "don't": 'do not', "doesn't": 'does not',
    "didn't": 'did not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
    "can't": 'can not', "cannot": 'can not', "won't": 'will not', "haven't": 'have not', "hasn't": 'has not',
    "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not',
};
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
// US spelling → British (the school's variety); either is accepted because both sides are normalised.
const US_UK = { color: 'colour', colors: 'colours', favorite: 'favourite', favorites: 'favourites', gray: 'grey',
    center: 'centre', theater: 'theatre', neighbor: 'neighbour', mom: 'mum',
    schoolbag: 'school bag', okay: 'ok' };

export function normalise(text) {
    return String(text ?? '').toLowerCase()
        .replace(/[’‘`]/g, "'")
        .replace(/\bjack\s*-?\s*o\s*'?\s*-?\s*lantern/g, 'jack o lantern') // jack-o'-lantern, Jack O'Lantern, jackolantern
        .replace(/[^a-z0-9' ]+/g, ' ')
        .split(/\s+/).filter(Boolean)
        // "she's got" is "she has got", not "she is got": 's before got means has.
        .map((w, i, ws) => (ws[i + 1] === 'got' && /^(he|she|it|who|what|that|there)'s$/.test(w) ? `${w.slice(0, -2)} has` : w))
        .map(w => CONTRACTIONS[w] ?? w)
        .map(w => (/^\d+$/.test(w) && Number(w) <= 20 ? NUMBERS[Number(w)] : w))
        .map(w => US_UK[w] ?? w)
        .join(' ')
        .replace(/'/g, '')
        .split(' ').filter(Boolean);
}

// Sound spelling: spelling variants that sound alike collapse (sea/see, right/write); vowel runs keep their first
// vowel, so pen ≠ pan and book ≠ bike. Lenient also merges what a French speaker swaps: h dropped,
// th ≈ t/d/s/z.
export function phoneticKey(word, lenient = false) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    w = w.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^wh/, 'w').replace(/ph/g, 'f').replace(/tch/g, 'ch')
        .replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
        .replace(/gh/g, '').replace(/z/g, 's').replace(/(?<=.)e$/, '');
    w = lenient
        ? w.replace(/th/g, 't').replace(/h/g, '').replace(/[dsz]/g, 't')
        : w.replace(/th/g, '0');
    return w.replace(/(?<=.)([aeiouy])[aeiouy]+/g, '$1').replace(/(.)\1+/g, '$1');
}

export function levenshtein(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return prev[b.length];
}

export function wordMatches(expected, heard, words) {
    if (expected === heard) return true;
    if (heard === `${expected}s` || expected === `${heard}s`) return true; // the recogniser's plural slips, not the child's
    if (words === 'exact') return false;
    if (phoneticKey(expected) === phoneticKey(heard)) return true;
    if (words !== 'lenient') return false;
    // An accent, not another word: one sound off (two on long words) once the French swaps are merged.
    const [ke, kh] = [phoneticKey(expected, true), phoneticKey(heard, true)];
    return levenshtein(ke, kh) <= (ke.length >= 6 ? 2 : 1);
}

const ARTICLES = new Set(['a', 'an', 'the']);
const dropArticle = (ws) => (ws.length > 1 && ARTICLES.has(ws[0]) ? ws.slice(1) : ws);

// Longest common subsequence under wordMatches: which expected words were heard, in order. Extra heard words
// ("um", a repeated word) cost nothing.
function align(expected, heard, words) {
    const n = expected.length, m = heard.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = wordMatches(expected[i], heard[j], words) ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const hit = new Array(n).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) {
        if (wordMatches(expected[i], heard[j], words) && dp[i][j] === 1 + dp[i + 1][j + 1]) { hit[i] = true; i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    return hit;
}

// expected: accepted answers (strings); heard: recogniser alternatives (strings, best first).
// A leading article is optional on both sides ("ruler" for "a ruler"): the word is what is being said.
// → { ok, score, words: [{ text, heard }], heard } for the best (answer, alternative) pair.
// sentence: true (grammar cards) — every word must be heard and words match at most phonetically: the one word that
// matters (has/have, don't/doesn't) must not slip through an 80 % ratio or an accent tolerance.
export function scoreSpeech(expected, heard, level = 'normal', { sentence = false } = {}) {
    const base = LEVELS[level] ?? LEVELS.normal;
    const ratio = sentence ? 1 : base.ratio;
    const words = sentence && base.words === 'lenient' ? 'phonetic' : base.words;
    let best = null;
    for (const answer of [expected].flat()) {
        const full = normalise(answer);
        const exp = dropArticle(full);
        const shown = String(answer).split(/\s+/).filter(Boolean);
        const offset = full.length - exp.length; // a dropped article stays shown and counts as heard
        // Contractions or "schoolbag" change the word count: then the shown words are marked as a whole.
        const oneToOne = full.length === shown.length;
        for (const alt of [heard].flat().filter(Boolean)) {
            const hit = align(exp, dropArticle(normalise(alt)), words);
            const score = exp.length ? hit.filter(Boolean).length / exp.length : 0;
            if (!best || score > best.score) {
                const whole = score >= ratio - 1e-9;
                best = { score, heard: alt, words: shown.map((text, k) => ({ text, heard: oneToOne ? (k < offset || hit[k - offset]) : whole })) };
            }
        }
    }
    if (!best) return { ok: false, score: 0, heard: '', words: [[expected].flat()[0] ?? ''].join(' ').split(/\s+/).map(text => ({ text, heard: false })) };
    return { ...best, ok: best.score >= ratio - 1e-9 };
}
