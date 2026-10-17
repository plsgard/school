// assets/gs/generators.js
// Pure: card → exercise. Distractors follow the Repères CP trap lists (visual/phonetic confusables).
// Every cue key maps to exactly one text (Task 13 records one clip per key); spoken texts are
// lowercase except sentence starts (TTS spells uppercase runs).
// A cue may carry `display`: what the page shows when it differs from what is said (I6). Letters are said by name
// ("elle") but shown written ("la lettre L"); syllables are said phonetically ("fu, zée") but shown written
// ("fu-sée"). display is not part of the clip identity: one key, one spoken text.

const VOWELS = ['a', 'e', 'i', 'o', 'u'];
// Vowels that may be stretched as a phoneme (é: "ééé" for fusée, bébé, nez). VOWELS stays a e i o u: blend draws from it.
const STRETCH_VOWELS = [...VOWELS, 'é'];
// Clip keys are ASCII: the phoneme id inside a key.
const phKey = (id) => (id === 'é' ? 'eacute' : id);
// sound-final: endings with no final sound (nasal vowels) that a child hears as close to the asked final sound.
const NEAR_FINAL = { o: ['on'], a: ['an', 'en'], n: ['on', 'in', 'an', 'en', 'oin'], m: ['on', 'in', 'an', 'en'] };
const DOTS = { 1: '●', 2: '● ●', 3: '● ● ●' };
// Objects to count/compare, always named in the cues (the child must know WHAT to count), with their French
// gender and plural. id = ASCII clip key. No 🎈: it is the word "ballon" of the word deck.
const OBJECTS = [
    { emoji: '🍎', id: 'pomme', sing: 'pomme', plur: 'pommes', fem: true },
    { emoji: '🐞', id: 'coccinelle', sing: 'coccinelle', plur: 'coccinelles', fem: true },
    { emoji: '⭐', id: 'etoile', sing: 'étoile', plur: 'étoiles', fem: true },
    { emoji: '🐟', id: 'poisson', sing: 'poisson', plur: 'poissons', fem: false },
    { emoji: '🍓', id: 'fraise', sing: 'fraise', plur: 'fraises', fem: true },
    { emoji: '🌼', id: 'fleur', sing: 'fleur', plur: 'fleurs', fem: true },
];
const NUM_WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
// Close phonemes (spec §2.2): voiced/unvoiced pairs and nasals, used as distractor traps.
const CLOSE_PHONEMES = { f: 'v', v: 'f', s: 'z', z: 's', ch: 'j', j: 'ch', m: 'n', n: 'm', p: 'b', b: 'p', t: 'd', d: 't', k: 'g', g: 'k' };
const CLOSE_LETTERS = { f: 'v', v: 'f', s: 'z', z: 's', m: 'n', n: 'm', l: 'r', r: 'l' };
// Digits a child confuses by shape: always shown together when one of them is the answer.
const MIRROR_DIGITS = { 6: 9, 9: 6, 1: 7, 7: 1 };
// Spoken name + ASCII id (the id is the clip key, so clip paths stay plain ASCII).
// No 🌙: it is the page's "come back tomorrow" icon (M2).
const PATTERN_NAMES = { '🔴': ['rouge'], '🔵': ['bleu'], '🟢': ['vert'], '🟡': ['jaune'], '⭐': ['étoile', 'etoile'], '❤️': ['cœur', 'coeur'], '🟣': ['violet'], '🟠': ['orange'], '⚫': ['noir'] };
const patternCue = (e) => { const [name, id = name] = PATTERN_NAMES[e]; return cue(`ui.pattern-choice.${id}`, name); };

const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
// French typography: a non-breaking space (U+00A0) before ! ? : ; so the mark never wraps to a line of its own.
const frenchSpaces = (s) => s.replace(/ ([!?:;])/g, '\u00a0$1');
const cue = (key, text, display) => {
    const c = { key, text: frenchSpaces(text) };
    if (display != null && frenchSpaces(display) !== c.text) c.display = frenchSpaces(display);
    return c;
};
// Written syllables (decks: syllW when the written cut differs from the spoken one, e.g. fu-sée / fu, zée).
const syllW = (w) => w.syll.map((s, i) => w.syllW?.[i] ?? s);
// Capitalises the first letter of every sentence (start, and after . ! ?). "…" is not a sentence end.
const sentences = (s) => s.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, sep, ch) => sep + ch.toUpperCase());
// "que" elides before a vowel-initial word (qu'un); "huit" has an h aspiré (que huit).
const VOWEL_START = /^[aeiouyàâéèêîïôû]/i;
const que = (word) => (VOWEL_START.test(word) ? `qu'${word}` : `que ${word}`);
// "de" elides the same way: d'étoiles, de pommes.
const de = (word) => (VOWEL_START.test(word) ? `d'${word}` : `de ${word}`);
const itemsOf = (cards, kind) => { const seen = new Map(); for (const c of cards) if (c.kind === kind) seen.set(c.item.id, c.item); return [...seen.values()]; };
const numSay = (cards, k) => itemsOf(cards, 'numbers').find(x => x.n === k)?.say ?? NUM_WORDS[k];
const numCue = (cards, k) => cue(`num.${k}`, numSay(cards, k));
// The number word agreeing with the object: un poisson, une étoile.
const numFor = (cards, o, k) => (k === 1 ? (o.fem ? 'une' : 'un') : numSay(cards, k));
// "une étoile", "trois étoiles", "un poisson".
const howMany = (cards, o, k) => `${numFor(cards, o, k)} ${k === 1 ? o.sing : o.plur}`;

// R15/R17: vowels and continuants are stretched (shown and said "fff"); occlusives are shown short ("b")
// but spoken with a schwa ("beu"), otherwise TTS would say the letter name ("bé").
const SCHWA = { b: 'beu', p: 'peu', k: 'keu', t: 'teu', d: 'deu', g: 'gueu' };
export function phoneme(id, letters = []) {
    const stretched = STRETCH_VOWELS.includes(id) || id === 'ch' || Boolean(letters.find(x => x.id === id)?.continuant);
    if (stretched) return { display: id.repeat(3), spoken: id.repeat(3), stretched };
    return { display: id, spoken: SCHWA[id] ?? `${id}eu`, stretched };
}
const soundPhrase = (ph) => (ph.stretched ? ph.spoken : `le son ${ph.spoken}`);
const soundPhraseW = (ph) => (ph.stretched ? ph.display : `le son «\u00a0${ph.display}\u00a0»`); // shown: the letter, not « beu »

// What an oral syllable sounds like, so two tiles never sound the same to a child who only hears them:
// chat = cha, teau = to, ris = ri, zée = zé, nez = né, mai = mè, gâ = ga, ce = se, ge = je; but lade ≠ la, mé ≠ mè.
export const heard = (s) => s.toLowerCase()
    .replace(/e?au/g, 'o').replace(/ée/g, 'é').replace(/(?:ez|er)$/, 'é').replace(/ai|ei|ê/g, 'è')
    .replace(/[âàôîïûù]/g, (ch) => ch.normalize('NFD')[0])
    .replace(/ph/g, 'f').replace(/qu/g, 'k').replace(/gu(?=[eiéè])/g, 'g§')
    .replace(/c(?=[eiéèy])/g, 's').replace(/c(?!h)/g, 'k').replace(/g(?=[eiéèy])/g, 'j').replace(/g§/g, 'g')
    .replace(/(?<=[aeiouéè])[tsdxzp]+$/u, '').replace(/(?<=[^aeiouéè])e$/u, '');

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

// Two distractors from `pool`: one trap (matching `isTrap`) when available, the other random.
function pickWithTrap(pool, isTrap, rng, used) {
    const trap = pickDistinct(pool.filter(isTrap), 1, rng, used);
    return [...trap, ...pickDistinct(pool, 2 - trap.length, rng, used)];
}

function letterCue(ch, letters) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    const l = base === ch ? letters.find(x => x.id === ch) : null;
    return l ? cue(`letter.${l.id}.name`, l.name) : cue(`letter.${ch}.name`, ch);
}

// Six digit tiles around n (count, dice); a digit confused by shape (6/9, 1/7) is always among them.
function digitChoices(cards, n) {
    const lo = Math.max(0, Math.min(n - 2, 5));
    let digits = Array.from({ length: 6 }, (_, i) => lo + i);
    const mirror = MIRROR_DIGITS[n];
    if (mirror !== undefined && !digits.includes(mirror)) {
        const far = digits.filter(d => d !== n).reduce((a, b) => (Math.abs(b - n) > Math.abs(a - n) ? b : a));
        digits = digits.map(d => (d === far ? mirror : d)).sort((a, b) => a - b);
    }
    return digits.map(d => ({ id: String(d), label: String(d), say: numCue(cards, d), correct: d === n, style: 'digit' }));
}

const GEN = {
    'syll-count'(card, { cards }) {
        const w = card.item, n = Math.min(w.syll.length, 3);
        return {
            layout: 'tap', prompt: cue(`ui.syll-count.${w.id}`, `Frappe dans tes mains en disant ${w.text}. Combien de syllabes ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: [1, 2, 3].map(k => ({ id: String(k), label: DOTS[k], say: numCue(cards, k), correct: k === n, style: 'dots' })),
            success: cue(`ui.syll-count-ok.${w.id}`, `Bravo ! ${w.syll.join(', ')} : ${n === 1 ? 'une syllabe' : `${numSay(cards, n)} syllabes`}.`,
                `Bravo ! ${syllW(w).join('-')} : ${n === 1 ? 'une syllabe' : `${numSay(cards, n)} syllabes`}.`),
        };
    },
    'syll-match'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words').filter(x => x.id !== w.id);
        const same = words.filter(x => x.syll[0] === w.syll[0]);
        const target = same.length ? pick(same, rng) : pick(words, rng);
        const used = new Set([target.emoji, target.id, w.emoji, w.id]);
        const distractors = pickWithTrap(words.filter(x => x.syll[0] !== w.syll[0]), x => x.rhyme === w.rhyme, rng, used);
        return {
            layout: 'tap', prompt: cue(`ui.syll-match.${w.id}`, `Écoute bien. Quel mot commence comme ${w.syll.join('-')} ?`,
                `Écoute bien. Quel mot commence comme ${syllW(w).join('-')} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.syll-match-ok.${w.id}.${target.id}`, `Oui ! ${w.text} et ${target.text} commencent pareil : ${w.syll[0]} !`,
                `Oui ! ${w.text} et ${target.text} commencent pareil : ${w.syll[0]} !`), // the shared sound is oral: « ba » for ballon
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
        const close = CLOSE_PHONEMES[w.initial];
        const distractors = pickWithTrap(words.filter(x => x.initial !== w.initial), x => x.initial === close, rng, used);
        const ph = phoneme(w.initial, itemsOf(cards, 'letters'));
        return {
            layout: 'tap', prompt: cue(`ui.sound-pick.${w.initial}`, `Quel mot commence par ${soundPhrase(ph)} ?`, `Quel mot commence par ${soundPhraseW(ph)} ?`),
            stage: { text: ph.display },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.sound-pick-ok.${target.id}`, `Oui ! ${target.text} commence par ${soundPhrase(ph)} !`,
                `Oui ! ${target.text} commence par ${soundPhraseW(ph)} !`),
        };
    },
    'sound-final'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words');
        const same = words.filter(x => x.id !== w.id && x.final === w.final);
        const target = same.length ? pick(same, rng) : w;
        const used = new Set([target.emoji, target.id]);
        // Trap (Repères CP ex. 17/18): a word that STARTS with the sound asked at the end.
        // A nasal ending (final null) sounds close to o / a / n / m: ballon is no fair "not ooo".
        const far = (x) => x.final !== w.final && !(x.final === null && NEAR_FINAL[w.final]?.includes(x.rhyme));
        const distractors = pickWithTrap(words.filter(far), x => x.initial === w.final, rng, used);
        const ph = phoneme(w.final, itemsOf(cards, 'letters'));
        return {
            layout: 'tap',
            prompt: cue(`ui.sound-final.${phKey(w.final)}`, `Quel mot finit par ${soundPhrase(ph)} ?`, `Quel mot finit par ${soundPhraseW(ph)} ?`),
            stage: { text: `…${ph.display}` },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.sound-final-ok.${target.id}`, `Oui ! ${target.text} finit par ${soundPhrase(ph)} !`, `Oui ! ${target.text} finit par ${soundPhraseW(ph)} !`),
        };
    },
    'syll-initial'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words');
        const tile = (x, i) => ({ id: `${x.id}-${i + 1}`, label: syllW(x)[i], style: 'syll',
            say: cue(`syl.${x.id}.${i + 1}`, x.syll[i], syllW(x)[i]), correct: x.id === w.id && i === 0 });
        const out = [tile(w, 0)];
        const oral = new Set([heard(w.syll[0])]), shown = new Set([syllW(w)[0]]);
        const add = (x, i) => {
            if (out.length >= 3 || oral.has(heard(x.syll[i])) || shown.has(syllW(x)[i])) return false;
            oral.add(heard(x.syll[i])); shown.add(syllW(x)[i]); out.push(tile(x, i)); return true;
        };
        // Trap 1: the word's own last syllable (pin for lapin), unless it sounds like the first (bé-bé).
        for (let i = w.syll.length - 1; i >= 1 && !add(w, i); i--) { /* try the previous one */ }
        const others = shuffle(words.filter(x => x.id !== w.id), rng);
        for (const x of [...others.filter(x => x.initial === w.initial), ...others]) add(x, 0);
        return {
            layout: 'select',
            // Listen first: the tiles are written, a non-reader taps each one to hear it.
            prompt: cue(`ui.syll-initial.${w.id}`, `Écoute les syllabes. Par quelle syllabe commence ${w.text} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: shuffle(out, rng),
            success: cue(`ui.syll-initial-ok.${w.id}`, `Oui ! ${w.text} commence par ${w.syll[0]} !`,
                `Oui ! ${w.text} commence par « ${syllW(w)[0]} » !`),
        };
    },
    'sound-letter'(card, { cards, rng }) {
        const l = card.item, letters = itemsOf(cards, 'letters');
        const ph = phoneme(l.id, letters);
        const words = itemsOf(cards, 'words').filter(w => w.initial === l.id);
        const w = words.length ? pick(words, rng) : null;
        // Never offer a letter that makes the same sound: it would be a second correct answer.
        const candidates = letters.filter(x => x.id !== l.id && x.sound !== l.sound);
        const conf = l.confusables.map(id => candidates.find(x => x.id === id)).find(Boolean) ?? pick(candidates, rng);
        const rest = candidates.filter(x => x.id !== conf.id);
        const other = rest.find(x => x.id === CLOSE_LETTERS[l.id]) ?? pick(rest.filter(x => x.continuant && x.sound), rng);
        const letterChoice = (x, correct) => ({ id: x.id, label: x.script, say: cue(`letter.${x.id}.name`, x.name), correct });
        return {
            layout: 'tap',
            prompt: w
                ? cue(`ui.sound-letter.${l.id}.${w.id}`, `${ph.spoken}${w.text.slice(w.initial.length)}. Quelle lettre chante au début de ${w.text} ?`)
                : cue(`ui.sound-letter.${l.id}`, `Quelle lettre fait le son ${ph.spoken} ?`),
            stage: w ? { emoji: w.emoji, text: w.text } : { text: ph.display },
            choices: shuffle([letterChoice(l, true), letterChoice(conf, false), letterChoice(other, false)], rng),
            success: w
                ? cue(`ui.sound-letter-ok.${l.id}.${w.id}`, `Oui ! C'est la lettre ${l.name}, comme au début de ${w.text} !`,
                    `Oui ! C'est la lettre ${l.cap}, comme au début de ${w.text} !`)
                : cue(`ui.sound-letter-ok.${l.id}`, `Oui ! La lettre ${l.name} fait ${ph.spoken} !`, `Oui ! La lettre ${l.cap} fait ${ph.display} !`),
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
            layout: 'multitap', prompt: cue(`ui.letter-3scripts.${l.id}`, `Trouve toutes les lettres ${l.name}. Il y en a trois.`,
                `Trouve toutes les lettres ${l.cap}. Il y en a trois.`),
            choices: shuffle(choices, rng),
            success: cue(`ui.letter-3scripts-ok.${l.id}`, `Bravo, tu as trouvé les trois lettres ${l.name} !`, `Bravo, tu as trouvé les trois lettres ${l.cap} !`),
        };
    },
    'blend'(card, { cards, rng }) {
        const l = card.item;
        const c = phoneme(l.id, itemsOf(cards, 'letters')).spoken;
        const v = pick(VOWELS, rng), vv = phoneme(v).spoken;
        const others = shuffle(VOWELS.filter(x => x !== v), rng).slice(0, 1);
        const confC = pick(['s', 'v', 'f', 'r', 'l', 'm', 'n', 'j', 'z'].filter(x => x !== l.id), rng);
        const choices = shuffle([
            { id: `${l.id}${v}`, label: `${l.id}${v}`, say: cue(`syl.${l.id}${v}`, `${l.id}${v}`), correct: true },
            { id: `${l.id}${others[0]}`, label: `${l.id}${others[0]}`, say: cue(`syl.${l.id}${others[0]}`, `${l.id}${others[0]}`), correct: false },
            { id: `${confC}${v}`, label: `${confC}${v}`, say: cue(`syl.${confC}${v}`, `${confC}${v}`), correct: false },
        ], rng);
        return {
            // R27: a tap plays the syllable and selects it, the green ✔ confirms (a non-reader cannot read "fa/fo/sa").
            layout: 'select', prompt: cue(`ui.blend.${l.id}${v}`, `Colle les sons : ${c}… ${vv}… Qu'est-ce que ça fait ?`),
            stage: { html: `<span class="tile">${l.id}</span><span class="plus">+</span><span class="tile">${v}</span>` },
            choices,
            sounds: [c, vv, `${l.id}${v}`], // parent mode: the adult prompt spells the blend
            success: cue(`ui.blend-ok.${l.id}${v}`, `Oui ! ${c} et ${vv}, ça fait ${l.id}${v} !`),
        };
    },
    'trace'(card, { cards }) {
        const it = card.item;
        // Only the fields a model has: pts2 (x, 4, 5), dot (i, j), bar (t, 7), dirOrder (8).
        const extras = Object.fromEntries([['pts2', it.trace2], ['dot', it.dot], ['bar', it.bar], ['dirOrder', it.dirOrder]].filter(([, v]) => v));
        const go = it.trace2 ? 'Pars du point vert, puis du point bleu.' : 'Pars du point vert.'; // two-stroke models (x, 4, 5)
        if (card.kind === 'numbers') {
            const n = it.n, word = numSay(cards, n);
            return {
                layout: 'trace',
                prompt: cue(`ui.trace-digit.${n}`, `Trace le chiffre ${word}. ${go}`, `Trace le chiffre ${n}. ${go}`),
                trace: { pts: it.trace, ...extras, label: String(n), say: numCue(cards, n), kind: 'digit' },
                success: cue(`ui.trace-digit-ok.${n}`, `Bravo, tu as bien tracé le chiffre ${word} !`, `Bravo, tu as bien tracé le chiffre ${n} !`),
            };
        }
        return {
            layout: 'trace',
            prompt: cue(`ui.trace.${it.id}`, `Trace la lettre ${it.name}. ${go}`, `Trace la lettre ${it.script}. ${go}`),
            trace: { pts: it.trace, ...extras, label: it.cursive, say: cue(`letter.${it.id}.name`, it.name), kind: 'letter' },
            success: cue(`ui.trace-ok.${it.id}`, `Bravo, tu as bien tracé la lettre ${it.name} !`, `Bravo, tu as bien tracé la lettre ${it.script} !`),
        };
    },
    'name-spell'(card, { cards, rng }) {
        const letters = itemsOf(cards, 'letters');
        const chars = (card.item.text.match(/\p{L}/gu) ?? []).map(ch => ch.toLowerCase());
        const says = chars.map(ch => letterCue(ch, letters));
        // Same cleaning as the tiles (letters only), but keep the hyphen/space between name parts.
        const clean = card.item.text.replace(/[^\p{L}\s-]/gu, '').replace(/\s+/g, ' ').trim();
        // An all-caps first name would be spelled out by TTS: say it in title case.
        const spoken = /\p{Lu}\p{Lu}/u.test(clean) ? clean.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase()) : clean;
        return {
            layout: 'slots', prompt: cue('ui.name-spell', 'Remets les lettres de ton prénom dans l\'ordre.'),
            answer: chars.join('').toUpperCase(),
            choices: shuffle(chars.map((ch, i) => ({ id: `${ch.toUpperCase()}${i}`, label: ch.toUpperCase(), say: says[i], correct: true })), rng),
            success: cue(`ui.name-spell-ok.${card.item.id}`, `${says.map(s => s.text).join(', ')} : ${spoken} !`,
                `${chars.map(ch => ch.toUpperCase()).join(', ')} : ${spoken} !`),
        };
    },
    'count'(card, { cards, rng }) {
        const n = card.item.n, o = pick(OBJECTS, rng);
        return {
            layout: 'tap', prompt: cue(`ui.count.${o.id}`, `Combien y a-t-il ${de(o.plur)} ?`),
            stage: { collection: Array(n).fill(o.emoji), scattered: rng() < 0.5 },
            choices: digitChoices(cards, n),
            success: cue(`ui.count-ok.${o.id}.${n}`, `Oui, il y a ${howMany(cards, o, n)} !`),
        };
    },
    'decompose'(card, { cards, rng }) {
        const n = card.item.n, lit = 1 + Math.floor(rng() * (n - 1));
        const say = (k) => numSay(cards, k);
        return {
            layout: 'dots', prompt: cue(`ui.decompose.${n}.${lit}`, `${say(n)}, c'est ${say(lit)} et encore combien ? Allume les ronds.`),
            target: n, lit, total: Math.max(n + 1, 6),
            reveal: numCue(cards, n - lit), // spoken after « Regarde. » when the dots are lit for the child
            success: cue(`ui.decompose-ok.${n}.${lit}`, `Oui ! ${say(n)}, c'est ${say(lit)} et ${say(n - lit)}.`),
        };
    },
    'compare'(card, { cards, rng }) {
        const n = card.item.n;
        const others = itemsOf(cards, 'numbers').filter(x => x.n !== n && x.n >= 1); // never an empty collection
        const close = others.filter(x => Math.abs(x.n - n) <= 2);
        const o = pick(close.length ? close : others, rng);
        const obj = pick(OBJECTS, rng);
        const hi = Math.max(n, o.n), lo = Math.min(n, o.n);
        const mk = (x) => ({ id: String(x.n), label: String(x.n), collection: Array(x.n).fill(obj.emoji), say: numCue(cards, x.n), correct: x.n === hi });
        return {
            layout: 'tap', prompt: cue(`ui.compare.${obj.id}`, `Où y a-t-il le plus ${de(obj.plur)} ?`),
            stage: { showCollections: true },
            choices: shuffle([mk(card.item), mk(o)], rng),
            success: cue(`ui.compare-ok.${obj.id}.${hi}.${lo}`, `Oui ! ${howMany(cards, obj, hi)}, c'est plus ${que(numFor(cards, obj, lo))}.`),
        };
    },
    'number-line'(card, { cards, rng }) {
        const n = card.item.n;
        const line = Array.from({ length: 10 }, (_, i) => i + 1).map(k => (k === n ? '?' : String(k)));
        const wrong = shuffle([n - 1, n + 1, n + 2, n - 2].filter(k => k >= 1 && k <= 10 && k !== n), rng).slice(0, 2);
        return {
            layout: 'tap', prompt: cue('ui.number-line', 'Quel nombre manque sur la ligne ?'),
            stage: { sequence: line },
            choices: shuffle([n, ...wrong].map(k => ({ id: String(k), label: String(k), say: numCue(cards, k), correct: k === n, style: 'digit' })), rng),
            success: cue(`ui.number-line-ok.${n}`, n >= 2
                ? `Oui, c'est ${numSay(cards, n)} ! Il vient juste après ${numSay(cards, n - 1)}.`
                : `Oui, c'est ${numSay(cards, n)} ! Il vient juste avant ${numSay(cards, n + 1)}.`),
        };
    },
    'dice'(card, { cards, rng }) {
        const n = card.item.n;
        let faces = [n];
        if (n > 6) { const lo = Math.max(1, n - 6), hi = Math.min(6, n - 1); const a = lo + Math.floor(rng() * (hi - lo + 1)); faces = [a, n - a]; }
        return {
            layout: 'tap',
            prompt: faces.length === 2 ? cue('ui.dice.two', 'Combien de points sur les deux dés ?') : cue('ui.dice.one', 'Combien de points sur le dé ?'),
            stage: { dice: faces },
            choices: digitChoices(cards, n),
            success: cue(`ui.dice-ok.${n}`, `Oui, il y a ${n === 1 ? 'un point' : `${numSay(cards, n)} points`} !`),
        };
    },
    'before-after'(card, { cards, rng }) {
        const n = card.item.n;
        const dir = pick([n >= 1 ? 'after' : null, n <= 9 ? 'before' : null].filter(Boolean), rng);
        const k = dir === 'after' ? n - 1 : n + 1;
        const other = dir === 'after' ? (k >= 1 ? k - 1 : k + 2) : (k <= 9 ? k + 1 : k - 2);
        const word = dir === 'after' ? 'après' : 'avant';
        return {
            layout: 'tap',
            prompt: cue(`ui.${dir}.${k}`, `Quel nombre vient juste ${word} ${numSay(cards, k)} ?`),
            stage: { sequence: dir === 'after' ? [String(k), '?'] : ['?', String(k)] },
            choices: shuffle([n, k, other].map(x => ({ id: String(x), label: String(x), say: numCue(cards, x), correct: x === n, style: 'digit' })), rng),
            success: cue(`ui.${dir}-ok.${k}`, `Oui ! ${word} ${numSay(cards, k)}, il y a ${numSay(cards, n)}.`),
        };
    },
    'add'(card, { cards, rng }) {
        const n = card.item.n, o = pick(OBJECTS, rng);
        const a = 1 + Math.floor(rng() * (n - 1)), b = n - a;
        const say = (k) => howMany(cards, o, k);
        return {
            layout: 'tap',
            prompt: cue(`ui.add.${o.id}.${a}.${b}`, `${say(a)} et ${say(b)}, ça fait combien ${de(o.plur)} ?`),
            stage: { groups: [Array(a).fill(o.emoji), Array(b).fill(o.emoji)] },
            choices: [1, 2, 3, 4, 5, 6].map(d => ({ id: String(d), label: String(d), say: numCue(cards, d), correct: d === n, style: 'digit' })),
            success: cue(`ui.add-ok.${o.id}.${a}.${b}`, `Oui ! ${say(a)} et ${say(b)}, ça fait ${say(n)}.`),
        };
    },
};

export function generate(card, { cards = [], rng = Math.random } = {}) {
    const gen = GEN[card.skill];
    if (!gen) throw new Error(`No generator for skill ${card.skill}`);
    const ex = gen(card, { cards, rng });
    const finish = (c) => cue(c.key, sentences(c.text), c.display == null ? null : sentences(c.display));
    return { type: card.skill, cardId: card.id, ...ex, prompt: finish(ex.prompt), success: finish(ex.success) };
}

export function generatePattern(rng = Math.random) {
    const pair = pick([['🔴', '🔵'], ['🟢', '🟡'], ['⭐', '❤️']], rng);
    const motif = pick([[0, 1, 1], [0, 1], [0, 0, 1]], rng);
    const seq = Array.from({ length: 7 }, (_, i) => pair[motif[i % motif.length]]);
    const answer = seq.pop();
    const third = pick(['🟣', '🟠', '⚫'].filter(e => !pair.includes(e)), rng);
    return {
        type: 'pattern', cardId: null, layout: 'tap', prompt: cue('ui.pattern', 'Regarde bien. Qu\'est-ce qui vient après ?'),
        stage: { sequence: [...seq, '?'] },
        choices: shuffle([pair[0], pair[1], third].map(e => ({ id: e, label: e, emoji: e, say: patternCue(e), correct: e === answer })), rng),
        success: cue('ui.pattern-ok', 'Bravo, tu as trouvé le motif !'),
    };
}
