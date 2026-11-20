// assets/lessons/qa.js
// Pure: the 'qa' kind of other subjects (a teacher's "question to know" and its model answer). Ladder (LESSON_LADDER,
// index.js): 1 pick the answer among plausible wrong ones → 2 cloze (type the key word missing from the answer)
// → 3 answer in a sentence of his own, right when every key idea is in it. Accents, case and punctuation never
// count: this is about remembering the idea and its words, not French spelling.
import { checkAnswer } from '../en/answer.js';

const ACCENTS = /[̀-ͯ]/g;

export const fold = (s) => String(s ?? '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(ACCENTS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function distance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row;
    }
    return prev[b.length];
}

// A key word of 6 letters or more tolerates one letter off (bactérie / bactéries); a short one must be exact
// (lait / laid are two words).
const wordMatches = (key, typed) => key === typed || (key.length >= 6 && distance(key, typed) <= 1);

// One alternative (one or more words) occurs in the typed words as consecutive whole words.
function occurs(alt, words) {
    const want = fold(alt).split(' ').filter(Boolean);
    if (!want.length) return false;
    for (let i = 0; i + want.length <= words.length; i++) {
        if (want.every((w, j) => wordMatches(w, words[i + j]))) return true;
    }
    return false;
}

// keys: [[alternatives of idea 1], [alternatives of idea 2], …]. 'almost' says how many ideas are missing.
export function checkSentence(keys, typed) {
    const words = fold(typed).split(' ').filter(Boolean);
    if (!words.length) return { outcome: 'wrong', missing: keys.length };
    const missing = keys.filter(alts => !alts.some(alt => occurs(alt, words))).length;
    if (missing === 0) return { outcome: 'right', missing: 0 };
    return { outcome: missing < keys.length ? 'almost' : 'wrong', missing };
}

// One character, compared without accents or case (keeps one character per character, so indexes stay aligned).
const loose = (ch) => ch.normalize('NFD').replace(ACCENTS, '').toLowerCase();
const isLetter = (ch) => ch != null && /[\p{L}\p{N}]/u.test(ch);

// Where `needle` is written in `text` as whole words, accents and case aside; -1 when it is not.
function findWord(text, needle) {
    const n = [...needle].map(loose).join('');
    for (let i = 0; i + needle.length <= text.length; i++) {
        if ([...text.slice(i, i + needle.length)].map(loose).join('') !== n) continue;
        if (isLetter(text[i - 1]) || isLetter(text[i + needle.length])) continue;
        return i;
    }
    return -1;
}

// The model answer split around the word to type: `item.cloze` when given, else the first key alternative (key
// order, then alternative order) written in the answer. null when no key is written in the answer.
export function clozeOf(item) {
    const a = String(item.a ?? '');
    const split = (i, len) => ({ before: a.slice(0, i), after: a.slice(i + len), answer: a.slice(i, i + len) });
    if (item.cloze) {
        const i = a.indexOf(item.cloze);
        return i < 0 ? null : split(i, item.cloze.length);
    }
    for (const alts of item.keys ?? []) {
        for (const alt of alts) {
            const i = findWord(a, alt);
            if (i >= 0) return split(i, alt.length);
        }
    }
    return null;
}

export function checkCloze(answer, typed) {
    return checkAnswer([fold(answer)], fold(typed), { case: false, punct: false }).outcome;
}

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const CONSIGNES = {
    pick: 'Touche la bonne réponse.',
    pick2: 'Touche la bonne réponse.',
    cloze: 'Écris le mot qui manque.',
    sentence: 'Réponds par une phrase.',
};

// card (kind 'qa') + ladder format → the exercise. Never throws on a thin item: a pick with fewer wrong answers
// has fewer choices, a cloze with no key in the answer becomes a sentence.
export function generateQa(card, { format, rng = Math.random }) {
    const { item } = card;
    const wrong = (item.wrong ?? []).filter(w => w && w !== item.a);
    let type = format;
    if (type === 'cloze' && !clozeOf(item)) type = 'sentence';
    const ex = { type, cardId: card.id, kind: 'qa', cue: item.q, model: item.a, consigne: CONSIGNES[type] ?? CONSIGNES.sentence };
    if (type === 'pick' || type === 'pick2') {
        const picked = type === 'pick2' ? wrong.slice(0, 1) : shuffle(wrong, rng).slice(0, 3);
        ex.choices = shuffle([{ text: item.a, correct: true }, ...picked.map(text => ({ text, correct: false }))], rng);
    } else if (type === 'cloze') {
        ex.cloze = clozeOf(item);
    } else {
        ex.type = 'sentence';
        ex.keys = item.keys ?? [];
    }
    return ex;
}
