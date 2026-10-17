// tools/cues.mjs — enumerate every cue (key → text) the GS track can speak, so one clip per key is recorded once.
// Nothing is duplicated by hand: exercise cues come from the generators, fixed cues from the modules that speak them.
import { generate, generatePattern } from '../assets/gs/generators.js';
import { UI_CUES } from '../assets/gs/renderers.js';
import { PAGE_CUES } from '../assets/gs/cues.js';

// Deterministic rng (mulberry32), so the sweep and the manifest are reproducible.
export function seededRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Same path the clip source requests: `${baseUrl}/${key.replaceAll('.', '/')}.mp3` (assets/core/speech.js).
export const clipPath = (key) => `${key.replaceAll('.', '/')}.mp3`;

// One key, one text: a second text for a known key would make the recorded clip lie.
export function addCue(cues, c) {
    if (!c?.key) return false;
    const prev = cues.get(c.key);
    if (prev !== undefined && prev !== c.text) throw new Error(`cue ${c.key}: two texts ${JSON.stringify(prev)} / ${JSON.stringify(c.text)}`);
    cues.set(c.key, c.text);
    return prev === undefined;
}

const emitted = (ex) => [ex.prompt, ex.success, ...(ex.choices ?? []).map(c => c.say), ex.trace?.say];
const leaves = (o) => (o.key ? [o] : Object.values(o).flatMap(leaves));

// Runs `make(rng)` with successive seeds until `stall` seeds in a row bring no new key (at least `min` seeds).
// The rng-dependent keys (syll-match / rhyme / sound-pick pairs, decompose splits, compare pairs, blend
// syllables, pattern choices…) are small finite sets, so this reaches all of them; the test sweeps other seeds.
function sweep(cues, make, { min, stall }) {
    const seen = new Set();
    for (let s = 0, quiet = 0; s < min || quiet < stall; s++) {
        let fresh = false;
        for (const c of emitted(make(seededRng(s)))) {
            if (!c?.key) continue;
            addCue(cues, c);
            if (!seen.has(c.key)) { seen.add(c.key); fresh = true; }
        }
        quiet = fresh ? 0 : quiet + 1;
    }
}

// cards: expandCards(decks, …). First-name cards are skipped (their cues stay device TTS at runtime),
// except the name-spell prompt, which does not depend on the name.
export function collectCues(cards, { min = 200, stall = 400 } = {}) {
    const cues = new Map();
    for (const card of cards) {
        if (card.kind === 'name') continue;
        sweep(cues, (rng) => generate(card, { cards, rng }), { min, stall });
    }
    sweep(cues, (rng) => generatePattern(rng), { min, stall });
    const nameCard = { id: 'name/x#name-spell', kind: 'name', skill: 'name-spell', item: { id: 'x', text: 'x' } };
    addCue(cues, generate(nameCard, { cards }).prompt);
    for (const c of [...leaves(UI_CUES), ...leaves(PAGE_CUES)]) addCue(cues, c);
    return cues;
}

// sayInput lives in assets/gs/say.js: the device voice applies the same transform at runtime (I2).
export { sayInput } from '../assets/gs/say.js';
