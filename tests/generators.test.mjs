// tests/generators.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards } from '../assets/gs/decks/index.js';
import { generate, generatePattern } from '../assets/gs/generators.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];
const cards = expandCards(decks, { firstName: 'Lou' });
const find = (id) => cards.find(c => c.id === id);
const rng = () => 0.42;
const RNGS = [0.05, 0.3, 0.42, 0.6, 0.97];
const byId = (id) => find(id);

function assertChoiceSet(ex, n) {
    assert.equal(ex.choices.length, n);
    assert.equal(ex.choices.filter(c => c.correct).length, 1, 'exactly one correct');
    assert.equal(new Set(ex.choices.map(c => c.label)).size, n, 'distinct labels');
    if (ex.choices[0].emoji) assert.equal(new Set(ex.choices.map(c => c.emoji)).size, n, 'distinct emoji');
}

describe('generate', () => {
    test('generate_SyllMatch_CorrectSharesInitialSyllable', () => {
        const ex = generate(find('mots-p1/lapin#syll-match'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.equal(ex.choices.find(c => c.correct).label, 'lama');
        assert.ok(!ex.choices.some(c => c.label === 'lapin'));
    });
    test('generate_SyllCount_TargetIsSyllableCount', () => {
        assert.equal(generate(find('mots-p1/papillon#syll-count'), { cards, rng }).choices.find(c => c.correct).id, '3');
        const ex = generate(find('mots-p1/banane#syll-count'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.equal(ex.choices.find(c => c.correct).id, '2');
    });
    test('generate_SoundPick_DistractorsNeverShareInitial', () => {
        const ex = generate(find('mots-p1/fusee#sound-pick'), { cards, rng });
        assertChoiceSet(ex, 3);
        for (const c of ex.choices.filter(c => !c.correct)) assert.notEqual(c.id, 'fusee');
    });
    test('generate_SoundLetter_UsesOnlyContinuantsAndIncludesConfusable', () => {
        const ex = generate(find('letters/f#sound-letter'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.ok(ex.choices.some(c => c.label === 'v' || c.label === 't'));
    });
    test('generate_Letter3Scripts_HasThreeTargetsAndConfusables', () => {
        const ex = generate(find('letters/a#letter-3scripts'), { cards, rng });
        assert.equal(ex.layout, 'multitap');
        assert.equal(ex.choices.length, 6);
        assert.equal(ex.choices.filter(c => c.correct).length, 3);
    });
    test('generate_Count_CollectionSizeMatchesAndSixDigits', () => {
        const ex = generate(find('numbers/7#count'), { cards, rng });
        assert.equal(ex.stage.collection.length, 7);
        assertChoiceSet(ex, 6);
        assert.equal(ex.choices.find(c => c.correct).label, '7');
    });
    test('generate_Decompose_LitPlusMissingEqualsTarget', () => {
        const ex = generate(find('numbers/5#decompose'), { cards, rng });
        assert.equal(ex.layout, 'dots');
        assert.equal(ex.target, 5);
        assert.ok(ex.lit >= 1 && ex.lit < 5);
    });
    test('generate_Compare_BiggerIsCorrect', () => {
        const ex = generate(find('numbers/8#compare'), { cards, rng });
        assertChoiceSet(ex, 2);
        const ok = ex.choices.find(c => c.correct), ko = ex.choices.find(c => !c.correct);
        assert.ok(Number(ok.id) > Number(ko.id));
    });
    test('generate_NameSpell_AnswerIsUppercaseName', () => {
        const ex = generate(find('name/lou#name-spell'), { cards, rng });
        assert.equal(ex.layout, 'slots');
        assert.equal(ex.answer, 'LOU');
        assert.equal(ex.choices.length, 3);
    });
    test('generate_Trace_CarriesWaypoints', () => {
        const ex = generate(find('letters/a#trace'), { cards, rng });
        assert.equal(ex.layout, 'trace');
        assert.ok(ex.trace.pts.length > 5);
    });
    test('generate_Blend_CorrectIsConsonantPlusVowel', () => {
        const ex = generate(find('letters/f#blend'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.match(ex.choices.find(c => c.correct).label, /^f[aeiou]$/);
    });
    test('generate_EveryCard_ProducesAnExerciseWithPromptAndSuccess', () => {
        for (const card of cards) {
            const ex = generate(card, { cards, rng });
            assert.ok(ex.prompt.text.length > 0, card.id);
            assert.ok(ex.success.text.length > 0, card.id);
        }
    });
    test('generate_SyllMatchAndRhyme_CorrectReallySharesSyllableOrRhyme', () => {
        for (const r of [0.05, 0.42, 0.97]) {
            for (const card of cards.filter(c => c.skill === 'syll-match' || c.skill === 'rhyme')) {
                const ex = generate(card, { cards, rng: () => r });
                const ok = ex.choices.find(c => c.correct);
                const w = cards.find(c => c.kind === 'words' && c.item.id === ok.id).item;
                if (card.skill === 'syll-match') assert.equal(w.syll[0], card.item.syll[0], `${card.id} @${r}`);
                else assert.equal(w.rhyme, card.item.rhyme, `${card.id} @${r}`);
                assert.notEqual(ok.id, card.item.id, `${card.id} @${r}`);
            }
        }
    });
    test('generate_ChoicesWithEmoji_EmojiAreDistinct', () => {
        for (const r of [0.05, 0.42, 0.97]) {
            for (const card of cards) {
                const ex = generate(card, { cards, rng: () => r });
                const withEmoji = (ex.choices ?? []).filter(c => c.emoji);
                if (!withEmoji.length) continue;
                assert.equal(withEmoji.length, ex.choices.length, `${card.id} @${r}`);
                assert.equal(new Set(withEmoji.map(c => c.emoji)).size, withEmoji.length, `${card.id} @${r}`);
            }
        }
    });
    test('generate_AllCueKeys_MapToOneTextAcrossCardsAndRng', () => {
        const seen = new Map();
        const add = (c, where) => {
            if (!c) return;
            if (seen.has(c.key)) assert.equal(c.text, seen.get(c.key), `${c.key} (${where})`);
            seen.set(c.key, c.text);
        };
        const all = [...cards, ...expandCards(decks, { firstName: 'Zoé' }).filter(c => c.kind === 'name')];
        for (const r of RNGS) {
            for (const card of all) {
                const ex = generate(card, { cards: all, rng: () => r });
                add(ex.prompt, card.id); add(ex.success, card.id);
                for (const ch of ex.choices ?? []) add(ch.say, card.id);
                if (ex.trace) add(ex.trace.say, card.id);
            }
            const p = generatePattern(() => r);
            add(p.prompt, 'pattern'); add(p.success, 'pattern');
            for (const ch of p.choices) add(ch.say, 'pattern');
        }
    });
    test('generate_SpokenTexts_HaveNoUppercaseRun', () => {
        for (const r of RNGS) {
            for (const card of cards) {
                const ex = generate(card, { cards, rng: () => r });
                const texts = [ex.prompt, ex.success, ...(ex.choices ?? []).map(c => c.say), ex.trace?.say].filter(Boolean).map(c => c.text);
                for (const s of texts) assert.doesNotMatch(s, /\p{Lu}\p{Lu}/u, `${card.id}: ${s}`);
            }
        }
    });
    test('generate_NumberCues_UseNumberWords', () => {
        for (const id of ['numbers/7#count', 'numbers/7#number-line', 'numbers/7#compare', 'mots-p1/lapin#syll-count']) {
            for (const ch of generate(byId(id), { cards, rng }).choices) assert.doesNotMatch(ch.say.text, /\d/, id);
        }
    });
    test('generate_NameSpell_SaysLetterNamesAndStripsNonLetters', () => {
        const all = expandCards(decks, { firstName: 'Lou-Zoé' });
        const ex = generate(all.find(c => c.id === 'name/louzoé#name-spell'), { cards: all, rng });
        assert.equal(ex.answer, 'LOUZOÉ');
        assert.equal(ex.choices.length, 6);
        assert.equal(ex.choices.find(c => c.label === 'L').say.text, 'elle');
        assert.deepEqual(ex.choices.find(c => c.label === 'É').say, { key: 'letter.é.name', text: 'é' });
        assert.equal(ex.success.key, 'ui.name-spell-ok.louzoé');
    });
    test('generate_Compare_PromptText', () => {
        assert.equal(generate(byId('numbers/8#compare'), { cards, rng }).prompt.text, 'Où y en a-t-il le plus ?');
    });
    test('generate_Trace_PromptAndSuccessTexts', () => {
        const ex = generate(byId('letters/l#trace'), { cards, rng });
        assert.equal(ex.prompt.text, 'Trace la lettre elle. Pars du point vert.');
        assert.equal(ex.success.text, 'Bravo, tu as bien tracé la lettre elle !');
    });
    test('generate_SyllCount_PromptDoesNotSegmentAndSuccessDoes', () => {
        const ex = generate(byId('mots-p1/lapin#syll-count'), { cards, rng });
        assert.equal(ex.prompt.text, 'Frappe dans tes mains en disant lapin. Combien de syllabes ?');
        assert.equal(ex.success.text, 'Bravo ! la, pin : deux syllabes.');
        assert.equal(generate(byId('mots-p1/chat#syll-count'), { cards, rng }).success.text, 'Bravo ! chat : une syllabe.');
    });
    test('generate_Count_SuccessTextUsesNumberWord', () => {
        assert.equal(generate(byId('numbers/7#count'), { cards, rng }).success.text, 'Oui, il y en a sept !');
    });
    test('generate_NumberLine_SuccessTexts', () => {
        assert.equal(generate(byId('numbers/5#number-line'), { cards, rng }).success.text, 'Oui, c\'est cinq ! Il vient juste après quatre.');
        assert.equal(generate(byId('numbers/1#number-line'), { cards, rng }).success.text, 'Oui, c\'est un ! Il vient juste avant deux.');
    });
    test('generate_Decompose_UsesNumberWords', () => {
        const ex = generate(byId('numbers/5#decompose'), { cards, rng: () => 0.3 });
        assert.equal(ex.lit, 2);
        assert.equal(ex.prompt.text, 'Cinq, c\'est deux et encore combien ? Allume les ronds.');
        assert.equal(ex.success.text, 'Oui ! Cinq, c\'est deux et trois.');
    });
    test('generate_SoundLetter_SuccessNamesTheLetter', () => {
        const ex = generate(byId('letters/l#sound-letter'), { cards, rng: () => 0.05 });
        assert.equal(ex.success.text, 'Oui ! C\'est la lettre elle, comme au début de lapin !');
        const a = generate(byId('letters/a#sound-letter'), { cards, rng });
        assert.equal(a.success.text, 'Oui ! La lettre a fait aaa !');
    });
    test('generate_SoundPick_StretchesOnlyContinuantsAndVowels', () => {
        assert.equal(generate(byId('mots-p1/fusee#sound-pick'), { cards, rng }).prompt.text, 'Quel mot commence par fff ?');
        assert.equal(generate(byId('mots-p1/chat#sound-pick'), { cards, rng }).prompt.text, 'Quel mot commence par chchch ?');
        assert.equal(generate(byId('mots-p1/bateau#sound-pick'), { cards, rng }).prompt.text, 'Quel mot commence par le son b ?');
    });
    test('generate_SyllMatch_OneDistractorRhymesWithTheWord', () => {
        for (const r of RNGS) {
            const ex = generate(byId('mots-p1/lapin#syll-match'), { cards, rng: () => r });
            assertChoiceSet(ex, 3);
            assert.ok(ex.choices.some(c => !c.correct && ['sapin', 'raisin'].includes(c.id)), `@${r}`);
        }
    });
    test('generate_SoundPick_OneDistractorHasClosePhoneme', () => {
        for (const r of RNGS) {
            const ex = generate(byId('mots-p1/fusee#sound-pick'), { cards, rng: () => r });
            assertChoiceSet(ex, 3);
            assert.ok(ex.choices.some(c => !c.correct && ['velo', 'voiture'].includes(c.id)), `@${r}`);
        }
    });
    test('generate_SoundLetter_OtherDistractorIsClosePhoneme', () => {
        for (const r of RNGS) {
            assert.ok(generate(byId('letters/f#sound-letter'), { cards, rng: () => r }).choices.some(c => c.id === 'v'), `f @${r}`);
            assert.ok(generate(byId('letters/m#sound-letter'), { cards, rng: () => r }).choices.some(c => c.id === 'n'), `m @${r}`);
        }
    });
    test('generate_SoundLetter_NoDistractorSharesTheSound', () => {
        const letters = decks[0].items;
        for (const r of RNGS) {
            for (const card of cards.filter(c => c.skill === 'sound-letter')) {
                const ex = generate(card, { cards, rng: () => r });
                assertChoiceSet(ex, 3);
                for (const ch of ex.choices.filter(c => !c.correct)) {
                    assert.notEqual(letters.find(l => l.id === ch.id).sound, card.item.sound, `${card.id} @${r}`);
                }
            }
        }
    });
    test('generate_Count_MirrorDigitsAppearTogether', () => {
        for (const [n, other] of [[6, '9'], [9, '6'], [1, '7'], [7, '1']]) {
            for (const r of RNGS) {
                const ex = generate(byId(`numbers/${n}#count`), { cards, rng: () => r });
                assertChoiceSet(ex, 6);
                assert.ok(ex.choices.some(c => c.label === other), `${n} @${r}`);
            }
        }
    });
    test('generatePattern_Always_ChoicesHaveDistinctNamedCues', () => {
        for (const r of RNGS) {
            const p = generatePattern(() => r);
            assert.equal(new Set(p.choices.map(c => c.say.key)).size, 3);
            assert.ok(!p.choices.some(c => c.emoji === '🤍'));
            for (const c of p.choices) assert.match(c.say.key, /^ui\.pattern-choice\./);
        }
    });
});
