// assets/gs/generators.js
// Pure: card → exercise. Distractors follow the Repères CP trap lists (visual/phonetic confusables).

const VOWELS = ['a', 'e', 'i', 'o', 'u'];
const DOTS = { 1: '●', 2: '● ●', 3: '● ● ●' };
const EMOJI_SETS = ['🍎', '🐞', '⭐', '🐟', '🎈', '🌼'];

const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const cue = (key, text) => ({ key, text });
const itemsOf = (cards, kind) => { const seen = new Map(); for (const c of cards) if (c.kind === kind) seen.set(c.item.id, c.item); return [...seen.values()]; };

function wordChoice(w, correct) {
    return { id: w.id, label: w.text, emoji: w.emoji, say: cue(`word.${w.id}`, w.text), correct };
}

function pickDistinct(pool, n, rng, used = new Set()) {
    const out = [];
    for (const w of shuffle(pool, rng)) {
        if (out.length === n) break;
        if (used.has(w.emoji) || used.has(w.id)) continue;
        used.add(w.emoji); used.add(w.id); out.push(w);
    }
    return out;
}

const GEN = {
    'syll-count'(card, { rng }) {
        const w = card.item, n = Math.min(w.syll.length, 3);
        return {
            layout: 'tap', prompt: cue(`ui.syll-count.${w.id}`, `Frappe dans tes mains : ${w.syll.join('-')}. Combien de syllabes dans ${w.text} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: [1, 2, 3].map(k => ({ id: String(k), label: DOTS[k], say: cue(`num.${k}`, String(k)), correct: k === n })),
            success: cue(`ui.syll-count-ok.${w.id}`, `Bravo ! ${w.syll.join(' – ').toUpperCase()}, ${n === 1 ? 'une syllabe' : n + ' syllabes'}.`),
        };
    },
    'syll-match'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words').filter(x => x.id !== w.id);
        const same = words.filter(x => x.syll[0] === w.syll[0]);
        const target = same.length ? pick(same, rng) : pick(words, rng);
        const used = new Set([target.emoji, target.id, w.emoji, w.id]);
        const distractors = pickDistinct(words.filter(x => x.syll[0] !== w.syll[0]), 2, rng, used);
        return {
            layout: 'tap', prompt: cue(`ui.syll-match.${w.id}`, `Écoute bien. Quel mot commence comme ${w.syll.join('-')} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.syll-match-ok.${w.id}.${target.id}`, `Oui ! ${w.syll[0].toUpperCase()}-${w.syll.slice(1).join('')}, ${target.syll[0].toUpperCase()}-${target.syll.slice(1).join('')} !`),
        };
    },
    'rhyme'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words').filter(x => x.id !== w.id);
        const same = words.filter(x => x.rhyme === w.rhyme);
        const target = same.length ? pick(same, rng) : pick(words, rng);
        const used = new Set([target.emoji, target.id, w.emoji, w.id]);
        const distractors = pickDistinct(words.filter(x => x.rhyme !== w.rhyme), 2, rng, used);
        return {
            layout: 'tap', prompt: cue(`ui.rhyme.${w.id}`, `Qu'est-ce qui rime avec ${w.text} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.rhyme-ok.${w.id}.${target.id}`, `Oui ! ${w.text}, ${target.text}, ça rime !`),
        };
    },
    'sound-pick'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words');
        const same = words.filter(x => x.id !== w.id && x.initial === w.initial);
        const target = same.length ? pick(same, rng) : w;
        const used = new Set([target.emoji, target.id]);
        const distractors = pickDistinct(words.filter(x => x.initial !== w.initial), 2, rng, used);
        const stretched = w.initial.length === 1 ? w.initial.repeat(3) : w.initial;
        return {
            layout: 'tap', prompt: cue(`ui.sound-pick.${w.initial}`, `Quel mot commence par ${stretched} ?`),
            stage: { text: stretched },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.sound-pick-ok.${target.id}`, `Oui ! ${stretched}, ${target.text} !`),
        };
    },
    'sound-letter'(card, { cards, rng }) {
        const l = card.item, letters = itemsOf(cards, 'letters');
        const words = itemsOf(cards, 'words').filter(w => w.initial === l.id);
        const w = words.length ? pick(words, rng) : null;
        const conf = letters.find(x => x.id === l.confusables[0]) ?? pick(letters.filter(x => x.id !== l.id), rng);
        const other = pick(letters.filter(x => x.id !== l.id && x.id !== conf.id && x.sound), rng);
        const letterChoice = (x, correct) => ({ id: x.id, label: x.script, say: cue(`letter.${x.id}.name`, x.name), correct });
        return {
            layout: 'tap', prompt: cue(w ? `ui.sound-letter.${l.id}.${w.id}` : `ui.sound-letter.${l.id}`, w ? `${l.sound.repeat(3)}${w.text.slice(1)}. Quelle lettre chante au début de ${w.text} ?` : `Quelle lettre fait le son ${l.sound.repeat(3)} ?`),
            stage: w ? { emoji: w.emoji, text: w.text } : { text: l.sound.repeat(3) },
            choices: shuffle([letterChoice(l, true), letterChoice(conf, false), letterChoice(other, false)], rng),
            success: cue(w ? `ui.sound-letter-ok.${l.id}.${w.id}` : `ui.sound-letter-ok.${l.id}`, `Oui, ${l.name} comme ${w ? w.text : l.sound.repeat(3)} !`),
        };
    },
    'letter-3scripts'(card, { cards, rng }) {
        const l = card.item, letters = itemsOf(cards, 'letters');
        const confs = l.confusables.map(id => letters.find(x => x.id === id)).filter(Boolean);
        while (confs.length < 3) confs.push(pick(letters.filter(x => x.id !== l.id && !confs.includes(x)), rng));
        const styles = ['cap', 'script', 'cursive'];
        const mk = (x, style, correct) => ({ id: `${x.id}-${style}`, label: x[style], style, say: cue(`letter.${x.id}.name`, x.name), correct });
        const choices = [
            ...styles.map(s => mk(l, s, true)),
            ...confs.slice(0, 3).map((x, i) => mk(x, styles[i], false)),
        ];
        return {
            layout: 'multitap', prompt: cue(`ui.letter-3scripts.${l.id}`, `Trouve toutes les lettres ${l.name}. Il y en a trois.`),
            choices: shuffle(choices, rng),
            success: cue(`ui.letter-3scripts-ok.${l.id}`, `Bravo, les trois ${l.name} !`),
        };
    },
    'blend'(card, { rng }) {
        const l = card.item;
        const v = pick(VOWELS, rng);
        const others = shuffle(VOWELS.filter(x => x !== v), rng).slice(0, 1);
        const confC = pick(['s', 'v', 'f', 'r', 'l', 'm', 'n', 'j', 'z'].filter(c => c !== l.id), rng);
        const choices = shuffle([
            { id: `${l.id}${v}`, label: `${l.id}${v}`, say: cue(`syl.${l.id}${v}`, `${l.id}${v}`), correct: true },
            { id: `${l.id}${others[0]}`, label: `${l.id}${others[0]}`, say: cue(`syl.${l.id}${others[0]}`, `${l.id}${others[0]}`), correct: false },
            { id: `${confC}${v}`, label: `${confC}${v}`, say: cue(`syl.${confC}${v}`, `${confC}${v}`), correct: false },
        ], rng);
        return {
            layout: 'tap', prompt: cue(`ui.blend.${l.id}${v}`, `Colle les sons : ${l.sound.repeat(3)}… ${v.repeat(3)}… Qu'est-ce que ça fait ?`),
            stage: { html: `<span class="tile">${l.id}</span><span class="plus">+</span><span class="tile">${v}</span>` },
            choices,
            success: cue(`ui.blend-ok.${l.id}${v}`, `Oui ! ${l.sound.repeat(3)} et ${v.repeat(3)}, ça fait ${l.id}${v} !`),
        };
    },
    'trace'(card) {
        const it = card.item;
        return {
            layout: 'trace',
            prompt: cue(`ui.trace.${it.id}`, `Trace le ${it.name}. Pars du point vert.`),
            trace: { pts: it.trace, dot: it.dot, bar: it.bar, label: it.cursive, say: cue(`letter.${it.id}.name`, it.name) },
            success: cue(`ui.trace-ok.${it.id}`, `Super ${it.name} !`),
        };
    },
    'name-spell'(card, { rng }) {
        const name = card.item.text.toUpperCase();
        const letters = [...name];
        return {
            layout: 'slots', prompt: cue('ui.name-spell', 'Remets les lettres de ton prénom dans l\'ordre.'),
            answer: name,
            choices: shuffle(letters.map((ch, i) => ({ id: `${ch}${i}`, label: ch, say: cue(`letter.${ch.toLowerCase()}.name`, ch), correct: true })), rng),
            success: cue('ui.name-spell-ok', `${letters.join(', ')} : ${card.item.text} !`),
        };
    },
    'count'(card, { rng }) {
        const n = card.item.n, emoji = pick(EMOJI_SETS, rng);
        const lo = Math.max(0, Math.min(n - 2, 5)), digits = Array.from({ length: 6 }, (_, i) => lo + i);
        return {
            layout: 'tap', prompt: cue('ui.count', `Combien y en a-t-il ?`),
            stage: { collection: Array(n).fill(emoji), scattered: rng() < 0.5 },
            choices: digits.map(d => ({ id: String(d), label: String(d), say: cue(`num.${d}`, String(d)), correct: d === n, style: 'digit' })),
            success: cue(`ui.count-ok.${n}`, `${card.item.say} ! ${n}.`),
        };
    },
    'decompose'(card, { rng }) {
        const n = card.item.n, lit = 1 + Math.floor(rng() * (n - 1));
        return {
            layout: 'dots', prompt: cue(`ui.decompose.${n}.${lit}`, `${card.item.say}, c'est ${lit} et encore combien ? Allume les ronds.`),
            target: n, lit, total: Math.max(n + 1, 6),
            success: cue(`ui.decompose-ok.${n}.${lit}`, `Oui ! ${card.item.say}, c'est ${lit} et ${n - lit}.`),
        };
    },
    'compare'(card, { cards, rng }) {
        const n = card.item.n;
        const others = itemsOf(cards, 'numbers').filter(x => x.n !== n);
        const close = others.filter(x => Math.abs(x.n - n) <= 2);
        const o = pick(close.length ? close : others, rng);
        const emoji = pick(EMOJI_SETS, rng);
        const mk = (x) => ({ id: String(x.n), label: String(x.n), collection: Array(x.n).fill(emoji), say: cue(`num.${x.n}`, x.say), correct: x.n === Math.max(n, o.n) });
        return {
            layout: 'tap', prompt: cue('ui.compare', 'Où y a-t-il le plus ?'),
            stage: { showCollections: true },
            choices: shuffle([mk(card.item), mk(o)], rng),
            success: cue(`ui.compare-ok.${Math.max(n, o.n)}.${Math.min(n, o.n)}`, `Oui, ${Math.max(n, o.n)}, c'est plus que ${Math.min(n, o.n)} !`),
        };
    },
    'number-line'(card, { rng }) {
        const n = card.item.n;
        const line = Array.from({ length: 10 }, (_, i) => i + 1).map(k => (k === n ? '?' : String(k)));
        const wrong = shuffle([n - 1, n + 1, n + 2, n - 2].filter(k => k >= 1 && k <= 10 && k !== n), rng).slice(0, 2);
        return {
            layout: 'tap', prompt: cue('ui.number-line', 'Quel nombre manque sur la ligne ?'),
            stage: { sequence: line },
            choices: shuffle([n, ...wrong].map(k => ({ id: String(k), label: String(k), say: cue(`num.${k}`, String(k)), correct: k === n, style: 'digit' })), rng),
            success: cue(`ui.number-line-ok.${n}`, `Oui, ${card.item.say} vient après ${n - 1} !`),
        };
    },
};

export function generate(card, { cards = [], rng = Math.random } = {}) {
    const gen = GEN[card.skill];
    if (!gen) throw new Error(`No generator for skill ${card.skill}`);
    return { type: card.skill, cardId: card.id, ...gen(card, { cards, rng }) };
}

export function generatePattern(rng = Math.random) {
    const pair = pick([['🔴', '🔵'], ['🟢', '🟡'], ['⭐', '🌙']], rng);
    const motif = pick([[0, 1, 1], [0, 1], [0, 0, 1]], rng);
    const seq = Array.from({ length: 7 }, (_, i) => pair[motif[i % motif.length]]);
    const answer = seq.pop();
    const third = pick(['🟣', '🟠', '🤍'].filter(e => !pair.includes(e)), rng);
    return {
        type: 'pattern', cardId: null, layout: 'tap', prompt: cue('ui.pattern', 'Regarde bien. Qu\'est-ce qui vient après ?'),
        stage: { sequence: [...seq, '?'] },
        choices: shuffle([pair[0], pair[1], third].map(e => ({ id: e, label: e, emoji: e, say: cue('ui.this-one', 'celui-là'), correct: e === answer })), rng),
        success: cue('ui.pattern-ok', 'Bravo, tu as trouvé le motif !'),
    };
}
