// tests/audio-cues.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';
import { generate, generatePattern } from '../assets/gs/generators.js';
import { UI_CUES } from '../assets/gs/renderers.js';
import { PAGE_CUES } from '../assets/gs/cues.js';
import { collectCues, addCue, seededRng, clipPath, sayInput } from '../tools/cues.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = await Promise.all(DECK_FILES.map(load));
const cards = expandCards(decks, { firstName: '' });
const cues = collectCues(cards);

// Every cue an exercise can make the page speak: prompt, success, choice long-press / tap, trace letter name.
const emitted = (ex) => [ex.prompt, ex.success, ...(ex.choices ?? []).map(c => c.say), ex.trace?.say].filter(c => c?.key);
const leaves = (o) => (o.key ? [o] : Object.values(o).flatMap(leaves));

describe('collectCues', () => {
    test('collectCues_ShippedDecks_CoversWordsLettersNumbersAndUi', () => {
        for (const k of ['word.lapin', 'letter.a.name', 'num.7', 'num.0', 'ui.lets-go', 'ui.syll-match.lapin', 'syl.fa', 'ui.pattern', 'ui.pattern-choice.orange', 'ui.pattern-choice.etoile'])
            assert.ok(cues.has(k), k);
        for (const [k, v] of cues) assert.ok(typeof v === 'string' && v.length > 0, k);
    });

    test('collectCues_LargeSeededSweep_EmitsNoKeyMissingFromTheCues', () => {
        // Seeds disjoint from the ones collectCues sweeps: an rng-dependent key it missed would show up here.
        const missing = new Set();
        for (let s = 0; s < 300; s++) {
            const rng = seededRng(1_000_003 + s);
            const exs = [...cards.map(card => generate(card, { cards, rng })), generatePattern(rng)];
            for (const ex of exs) for (const c of emitted(ex)) {
                if (!cues.has(c.key)) missing.add(c.key);
                else assert.equal(cues.get(c.key), c.text, c.key);
            }
        }
        assert.deepEqual([...missing], []);
    });

    test('collectCues_FixedUiCues_RecordedWithTheTextTheModulesSpeak', () => {
        for (const c of [...leaves(UI_CUES), ...leaves(PAGE_CUES)]) assert.equal(cues.get(c.key), c.text, c.key);
    });

    test('collectCues_FirstNameCard_RecordsOnlyTheFixedPrompt', () => {
        const named = collectCues(expandCards(decks, { firstName: 'Zoé' }));
        assert.ok(named.has('ui.name-spell'));
        assert.ok(!named.has('ui.name-spell-ok.zoé') && !named.has('letter.é.name'), 'name-dependent cues stay TTS');
        assert.equal(named.size, cues.size);
        assert.ok(cues.has('ui.name-spell'), 'the name-spell prompt is recorded even before a first name is set');
    });
});

describe('addCue', () => {
    test('addCue_SameKeyDifferentText_Throws', () => {
        const m = new Map();
        addCue(m, { key: 'ui.x', text: 'a' });
        addCue(m, { key: 'ui.x', text: 'a' });
        assert.throws(() => addCue(m, { key: 'ui.x', text: 'b' }), /ui\.x/);
    });
});

describe('clipPath', () => {
    test('clipPath_DottedKey_MatchesTheUrlTheClipSourceRequests', () => {
        assert.equal(clipPath('ui.trace-hint.start'), 'ui/trace-hint/start.mp3');
        assert.equal(clipPath('letter.a.name'), 'letter/a/name.mp3');
    });
});

describe('sayInput', () => {
    test('sayInput_StandaloneStretchedConsonant_LongRunWithSchwa', () => {
        assert.equal(sayInput('Quel mot commence par fff\u00a0?'), 'Quel mot commence par ffffffeu\u00a0?');
        assert.equal(sayInput('Quel mot commence par chchch\u00a0?'), 'Quel mot commence par chchchchchcheu\u00a0?');
    });
    test('sayInput_BlendPrompt_StretchesConsonantAndVowel', () => {
        assert.equal(sayInput('Colle les sons\u00a0: lll… aaa… Qu\'est-ce que ça fait\u00a0?'), 'Colle les sons\u00a0: lllllleu… aaaaaa… Qu\'est-ce que ça fait\u00a0?');
    });
    test('sayInput_WordInitialStretch_KeepsTheWord', () => {
        assert.equal(sayInput('Fffusée. Quelle lettre chante au début de fusée\u00a0?'), 'Ffffffusée. Quelle lettre chante au début de fusée\u00a0?');
        assert.equal(sayInput('lllapin.'), 'llllllapin.');
    });
    test('sayInput_PlainTextAndSchwaOcclusives_Unchanged', () => {
        for (const t of ['Quel mot commence par le son beu\u00a0?', 'Bravo\u00a0! La, pin\u00a0: deux syllabes.', 'elle', 'fa', 'chat']) assert.equal(sayInput(t), t);
    });
    test('sayInput_SentenceInitialCapital_StretchedOnceAndKeepsCapital', () => {
        assert.equal(sayInput('Oui\u00a0! Lll et eee, ça fait le\u00a0!'), 'Oui\u00a0! Lllllleu et eeeeee, ça fait le\u00a0!');
        assert.equal(sayInput('Chchch'), 'Chchchchchcheu');
    });
    test('sayInput_AbbreviationSyllables_SilentH', () => {
        assert.equal(sayInput('za'), 'zah');
        assert.equal(sayInput('Oui\u00a0! zzz et iii, ça fait zi\u00a0!'), 'Oui\u00a0! zzzzzzeu et iiiiii, ça fait zih\u00a0!');
    });
});

describe('manifest', () => {
    const OUT = new URL('../assets/audio/gs/', import.meta.url);
    test('manifest_ShippedCues_EveryKeyListedSortedAndBackedByAnMp3', async () => {
        const manifest = JSON.parse(await readFile(new URL('manifest.json', OUT), 'utf8'));
        assert.deepEqual(manifest, [...manifest].sort());
        assert.deepEqual([...cues.keys()].filter(k => !manifest.includes(k)), []);
        for (const k of manifest) await access(new URL(clipPath(k), OUT));
    });

    test('manifest_EveryKey_IsACurrentCue', async () => {
        const manifest = JSON.parse(await readFile(new URL('manifest.json', OUT), 'utf8'));
        assert.deepEqual(manifest.filter(k => !cues.has(k)), []);
    });

    test('manifest_EveryClipKey_IsAscii', async () => {
        const manifest = JSON.parse(await readFile(new URL('manifest.json', OUT), 'utf8'));
        assert.deepEqual(manifest.filter(k => !/^[a-z0-9.-]+$/.test(k)), []);
    });
});

describe('sources', () => {
    test('sources_EveryCue_RecordedFromItsCurrentText', async () => {
        // A cue text changed without re-running tools/gen-audio.mjs would leave a clip that says the old text.
        const src = JSON.parse(await readFile(new URL('../assets/audio/gs/sources.json', import.meta.url), 'utf8'));
        const stale = [];
        for (const [k, text] of cues) {
            const r = src[k];
            if (!r) stale.push(`${k}: no recipe`);
            else if (r.manual) { if (r.text !== text) stale.push(`${k}: manual clip recorded for ${JSON.stringify(r.text)}`); }
            else if (r.input !== (r.engine === 'say' ? sayInput(text) : text)) stale.push(`${k}: recorded from ${JSON.stringify(r.input)}`);
        }
        assert.deepEqual(stale, []);
    });
});
