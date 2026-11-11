// assets/en/lesson-generators.js
// Pure: a lesson card (kinds 'spell' / 'write') + a ladder format → the exercise to play.
//   pick / pick2: the right written form among 4 (or 2) look-alikes      fill: the answer with blanks, typed in full
//   tiles: letters (spell) or words (write) to put in order              type: typed from the cue
//   cover: shown a few seconds, hidden, typed                            hear: dictation (no cue)
import { strictFor } from './answer.js';
import { resolveItem } from './today.js';

const NBSP = ' ';
const CONSIGNES = {
    pick: 'Touche la bonne écriture.',
    pick2: 'Touche la bonne écriture.',
    fill: 'Complète les lettres qui manquent.',
    tiles: 'Remets dans l’ordre.',
    type: 'Écris en anglais.',
    cover: 'Regarde bien, puis écris de mémoire.',
    hear: 'Écoute et écris.',
};
const LETTER = /[a-z]/i;
const MARK = /^[,.?!]$/;

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// spell: blanks in the last word, first where the look-alikes go wrong, never its first letter.
// write: one word blanked (two when the phrase has more than three).
export function fillPattern(kind, model, slips = [], rng = Math.random) {
    if (kind === 'write') {
        const tokens = model.split(' ');
        const eligible = tokens.map((t, i) => (LETTER.test(t) ? i : -1)).filter(i => i >= 0);
        const hidden = new Set(shuffle(eligible, rng).slice(0, tokens.length > 3 ? 2 : 1));
        return tokens.map((t, i) => (hidden.has(i) ? t.replace(/[a-z0-9]/gi, '_') : t)).join(' ');
    }
    const start = Math.max(model.lastIndexOf(' '), model.lastIndexOf('-')) + 1;
    const candidates = [...model].map((ch, i) => (i > start && LETTER.test(ch) ? i : -1)).filter(i => i >= 0);
    if (!candidates.length) return model;
    const cap = candidates.length <= 3 ? candidates.length : Math.ceil(candidates.length * 0.6);
    const blanks = new Set();
    for (const slip of slips) {
        let i = 0;
        while (i < model.length && model[i] === slip[i]) i++;
        if (slip.length === model.length) { for (let j = i; j < model.length; j++) if (slip[j] !== model[j] && candidates.includes(j)) blanks.add(j); }
        else if (candidates.includes(i)) blanks.add(i);
    }
    const want = Math.min(cap, Math.max(2, Math.ceil(candidates.length * 0.4)));
    for (let k = 0; blanks.size < want && k < candidates.length; k += 2) blanks.add(candidates[k]);
    for (let k = 1; blanks.size < want && k < candidates.length; k += 2) blanks.add(candidates[k]);
    const kept = [...blanks].sort((a, b) => a - b).slice(0, cap);
    return [...model].map((ch, i) => (kept.includes(i) ? '_' : ch)).join('');
}

// spell: the letters of the last word ("the twenty-" stays in place); write: words, punctuation on its own tile.
export function tilesFor(kind, model, rng = Math.random) {
    let prefix = '';
    let ordered;
    if (kind === 'write') {
        ordered = model.split(' ').flatMap(t => { const m = t.match(/^(.*?)([,.?!]*)$/); return m[1] ? [m[1], ...m[2]] : [...m[2]]; });
    } else {
        const cut = Math.max(model.lastIndexOf(' '), model.lastIndexOf('-')) + 1;
        prefix = model.slice(0, cut);
        ordered = [...model.slice(cut)];
    }
    let tiles = ordered;
    for (let i = 0; i < 20 && tiles.join('\u0000') === ordered.join('\u0000'); i++) tiles = shuffle(ordered, rng);
    return { prefix, tiles };
}

export function joinTiles(kind, prefix, tiles) {
    if (kind !== 'write') return prefix + tiles.join('');
    return tiles.reduce((s, t) => (!s || MARK.test(t) ? s + t : `${s} ${t}`), '');
}

export function generateLesson(card, { format, cards, rng = Math.random, now = new Date() }) {
    const item = resolveItem(card.item, now);
    const kind = card.kind;
    const model = item.en[0];
    const others = cards.filter(c => c.deckId === card.deckId && c.item.id !== item.id && !c.item.dynamic).map(c => c.item.en[0]);
    const ex = {
        type: format, cardId: card.id, kind,
        cue: format === 'hear' ? null : item.cue,
        hint: card.deck.consigne ?? '',
        consigne: format === 'type' && card.deck.consigne ? card.deck.consigne : CONSIGNES[format],
        accepted: item.en, model,
        strict: strictFor(kind, item),
        confusables: others,
        say: item.hear ?? model,
    };
    if (format === 'pick' || format === 'pick2') {
        const wrong = [...new Set([...shuffle(item.slips ?? [], rng), ...shuffle(others, rng)])].filter(t => !item.en.includes(t));
        const n = format === 'pick2' ? 1 : 3;
        // pick2 keeps the most typical look-alike (the first one written in the lesson file).
        const picked = format === 'pick2' ? [(item.slips ?? [])[0] ?? wrong[0]] : wrong.slice(0, n);
        ex.choices = shuffle([{ text: model, correct: true }, ...picked.filter(Boolean).map(text => ({ text, correct: false }))], rng);
    } else if (format === 'fill') {
        ex.pattern = fillPattern(kind, model, item.slips, rng);
    } else if (format === 'tiles') {
        Object.assign(ex, tilesFor(kind, model, rng));
    } else if (format === 'cover') {
        ex.showMs = 3000;
    } else if (format !== 'type' && format !== 'hear') {
        throw new Error(`unknown format ${format}`);
    }
    return ex;
}

export { NBSP };
