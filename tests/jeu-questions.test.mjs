// tests/jeu-questions.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, generate, conjugate, fmt, fmtTime, fmtMoney, typo } from '../assets/jeu/questions.js';

// Deterministic rng (mulberry32).
const seeded = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const each = (fn) => {
    for (const skill of SKILLS) {
        for (let level = 1; level <= skill.levels; level++) {
            const rng = seeded(level * 1000 + skill.id.length);
            for (let i = 0; i < 300; i++) fn(generate(skill.id, level, rng), skill, level);
        }
    }
};

describe('generate', () => {
    test('generate_EverySkillAndLevel_AnswerIsOneOfTwoToFourDistinctChoices', () => {
        each((q, skill, level) => {
            const where = `${skill.id} L${level}: ${q.prompt}`;
            assert.ok(q.choices.includes(q.answer), where);
            assert.ok(q.choices.length >= 2 && q.choices.length <= 4, `${where} → ${q.choices}`);
            assert.equal(new Set(q.choices).size, q.choices.length, where);
        });
    });
    test('generate_EverySkillAndLevel_ChoicesFitOnACreature', () => {
        each((q, skill) => { for (const c of q.choices) assert.ok(c.length > 0 && c.length <= 16, `${skill.id}: « ${c} »`); });
    });
    test('generate_EverySkillAndLevel_FrenchTypography', () => {
        each((q, skill) => {
            for (const text of [q.prompt, ...q.choices]) {
                assert.doesNotMatch(text, / [?!:;»]|« |'/, `${skill.id}: ${text}`);
                assert.doesNotMatch(text, /undefined|NaN|-\d/, `${skill.id}: ${text}`);
            }
        });
    });
    test('generate_LevelOutOfRange_ClampedToSkillLevels', () => {
        assert.equal(generate('conj.temps', 9, seeded(1)).level, 2);
        assert.equal(generate('calc.add', 0, seeded(1)).level, 1);
    });
    test('generate_WithAvoid_GivesAnotherPrompt', () => {
        const rng = seeded(7);
        const seen = new Set();
        for (let i = 0; i < 6; i++) {
            const q = generate('geo.formes', 1, rng, seen);
            if (seen.size < 5) assert.ok(!seen.has(q.prompt), q.prompt);
            seen.add(q.prompt);
        }
    });
});

describe('maths', () => {
    const value = (s) => Number(s.replace(/\s/g, ''));
    test('generate_CalcSkills_AnswerIsTheResult', () => {
        const rng = seeded(42);
        for (let i = 0; i < 300; i++) {
            const level = 1 + (i % 3);
            let q = generate('calc.add', level, rng);
            let [a, b] = q.prompt.replace(' = …', '').split(' + ').map(value);
            assert.equal(value(q.answer), a + b, q.prompt);
            q = generate('calc.sub', level, rng);
            [a, b] = q.prompt.replace(' = …', '').split(' − ').map(value);
            assert.equal(value(q.answer), a - b, q.prompt);
            q = generate('calc.tables', level, rng);
            [a, b] = q.prompt.replace(' = …', '').split(' × ').map(value);
            assert.equal(value(q.answer), a * b, q.prompt);
        }
    });
    test('generate_NumCompare_AnswerIsTheExtreme', () => {
        const rng = seeded(3);
        for (let i = 0; i < 200; i++) {
            const q = generate('num.compare', 1 + (i % 3), rng);
            const nums = q.choices.map(value);
            assert.equal(value(q.answer), q.prompt.includes('grand') ? Math.max(...nums) : Math.min(...nums));
        }
    });
    test('generate_MesHeure_ClockMatchesAnswer', () => {
        const rng = seeded(5);
        for (let i = 0; i < 200; i++) {
            const q = generate('mes.heure', 1 + (i % 3), rng);
            assert.equal(q.answer, fmtTime(q.clock.h, q.clock.m));
        }
    });
    test('formats_NumbersTimesMoney_AsWrittenInClass', () => {
        assert.equal(fmt(4582), '4\u00a0582');
        assert.equal(fmt(3005), '3\u00a0005');
        assert.equal(fmt(999), '999');
        assert.equal(fmtTime(3, 0), '3\u00a0h');
        assert.equal(fmtTime(3, 5), '3\u00a0h\u00a005');
        assert.equal(fmtMoney(80), '80\u00a0c');
        assert.equal(fmtMoney(200), '2\u00a0€');
        assert.equal(fmtMoney(275), '2\u00a0€\u00a075');
    });
});

describe('français', () => {
    test('conjugate_RegularVerb_ThreeTenses', () => {
        assert.deepEqual(conjugate('chanter', 'p'), ['chante', 'chantes', 'chante', 'chantons', 'chantez', 'chantent']);
        assert.deepEqual(conjugate('chanter', 'f'), ['chanterai', 'chanteras', 'chantera', 'chanterons', 'chanterez', 'chanteront']);
        assert.deepEqual(conjugate('chanter', 'i'), ['chantais', 'chantais', 'chantait', 'chantions', 'chantiez', 'chantaient']);
    });
    test('conjugate_IrregularVerbs_KnownForms', () => {
        assert.deepEqual(conjugate('être', 'i'), ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient']);
        assert.deepEqual(conjugate('aller', 'f'), ['irai', 'iras', 'ira', 'irons', 'irez', 'iront']);
        assert.equal(conjugate('voir', 'i')[3], 'voyions');
        assert.equal(conjugate('venir', 'f')[5], 'viendront');
        assert.equal(conjugate('faire', 'p')[4], 'faites');
    });
    test('generate_Conjugation_ElidesJeBeforeAVowel', () => {
        const rng = seeded(11);
        for (let i = 0; i < 400; i++) {
            const q = generate('conj.imparfait', 1 + (i % 3), rng);
            if (q.prompt.includes('J’')) assert.match(q.answer, /^[aeiouyéèê]/, q.prompt);
            if (q.prompt.includes('Je ')) assert.doesNotMatch(q.answer, /^[aeiouyéèê]/, q.prompt);
        }
    });
    test('generate_LexAlpha_AnswerSortsFirst', () => {
        const rng = seeded(13);
        const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
        for (let i = 0; i < 200; i++) {
            const q = generate('lex.alpha', 1 + (i % 3), rng);
            assert.equal(q.answer, [...q.choices].sort((a, b) => plain(a).localeCompare(plain(b), 'fr'))[0]);
        }
    });
    test('typo_FrenchPunctuation_NoBreakSpaces', () => {
        assert.equal(typo("« Où vas-tu ? » C'est : oui !"), '«\u00a0Où vas-tu\u00a0?\u00a0» C’est\u00a0: oui\u00a0!');
    });
});
