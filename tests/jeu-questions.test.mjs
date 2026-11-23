// tests/jeu-questions.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, generate, conjugate, fmt, fmtTime, fmtMoney, typo, inWords } from '../assets/jeu/questions.js';

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
    test('generate_SamePromptAnywhere_AlwaysTheSameAnswer', () => {
        const seen = new Map();
        each((q, skill) => {
            if (q.clock) return; // « Quelle heure est-il ? »: the clock is part of the question
            const key = `${skill.id}|${q.prompt}|${[...q.choices].sort()}`;
            const before = seen.get(key) ?? q.answer;
            assert.equal(q.answer, before, key);
            seen.set(key, q.answer);
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

describe('harder levels', () => {
    const value = (s) => Number(s.replace(/\s/g, ''));
    const run = (skill, level, n, fn) => { const rng = seeded(level * 77 + skill.length); for (let i = 0; i < n; i++) fn(generate(skill, level, rng)); };
    test('generate_CalcLevelFour_AnswerFillsTheBlank', () => {
        const solve = (prompt) => {
            const [left, right] = prompt.split(' = ');
            const [a, op, b] = left.split(' ');
            if (right === '…') return { '+': value(a) + value(b), '−': value(a) - value(b), '×': value(a) * value(b) }[op];
            const r = value(right);
            if (a === '…') return op === '+' ? r - value(b) : r / value(b);
            return op === '−' ? value(a) - r : r / value(a);
        };
        for (const skill of ['calc.add', 'calc.sub', 'calc.tables', 'calc.double']) {
            run(skill, 4, 300, (q) => {
                if (q.prompt.startsWith('Dans')) { const [n, t] = q.prompt.match(/\d+/g).map(Number); assert.equal(value(q.answer) * t, n, q.prompt); return; }
                if (q.prompt.startsWith('Le quart')) { assert.equal(value(q.answer) * 4, Number(q.prompt.match(/\d+/)[0]), q.prompt); return; }
                if (q.prompt.startsWith('Le triple')) { assert.equal(value(q.answer), 3 * Number(q.prompt.match(/\d+/)[0]), q.prompt); return; }
                assert.equal(value(q.answer), solve(q.prompt), q.prompt);
            });
        }
    });
    test('generate_NumCompareLevelFour_OnlyTheAnswerIsBetween', () => {
        run('num.compare', 4, 300, (q) => {
            const [lo, hi] = q.prompt.match(/\d[\d\u00a0]*\d/g).map(value);
            for (const c of q.choices) assert.equal(value(c) > lo && value(c) < hi, c === q.answer, `${q.prompt} ${c}`);
        });
    });
    test('generate_NumDecomposeLevelFour_WordsAndCountsMatch', () => {
        run('num.decompose', 4, 300, (q) => {
            if (q.prompt.startsWith('Écris')) { assert.equal(inWords(value(q.answer)), q.prompt.split('\u00a0: ')[1], q.prompt); return; }
            const n = value(q.prompt.match(/Dans ([\d\u00a0]+),/)[1]);
            assert.equal(value(q.answer), Math.floor(n / (q.prompt.includes('centaines') ? 100 : 10)), q.prompt);
        });
    });
    test('inWords_TrickyNumbers_RectifiedSpelling', () => {
        assert.equal(inWords(1000), 'mille');
        assert.equal(inWords(2000), 'deux-mille');
        assert.equal(inWords(2305), 'deux-mille-trois-cent-cinq');
        assert.equal(inWords(4200), 'quatre-mille-deux-cents');
        assert.equal(inWords(1080), 'mille-quatre-vingts');
        assert.equal(inWords(7081), 'sept-mille-quatre-vingt-un');
        assert.equal(inWords(9971), 'neuf-mille-neuf-cent-soixante-et-onze');
        assert.equal(inWords(3091), 'trois-mille-quatre-vingt-onze');
        assert.equal(inWords(5121), 'cinq-mille-cent-vingt-et-un');
        assert.equal(inWords(6017), 'six-mille-dix-sept');
        assert.equal(inWords(8100), 'huit-mille-cent');
    });
    test('generate_MesHeureLevelFour_DurationsAddUp', () => {
        const min = (t) => { const [h, m = '0'] = t.split('\u00a0h\u00a0'); return Number(h.replace('\u00a0h', '')) * 60 + Number(m); };
        run('mes.heure', 4, 300, (q) => {
            const times = q.prompt.match(/\d+\u00a0h(\u00a0\d\d)?/g);
            if (q.prompt.startsWith('Je pars')) assert.equal(Number(q.answer.split('\u00a0')[0]), min(times[1]) - min(times[0]), q.prompt);
            else assert.equal(min(q.answer), min(times[0]) + Number(q.prompt.match(/(\d+) min/)[1]), q.prompt);
        });
    });
    test('generate_MesMonnaieLevelFour_ChangeIsBillMinusBothPrices', () => {
        const cents = (t) => { const m = t.match(/^(\d+)\u00a0(€|c)(?:\u00a0(\d\d))?$/); return m[2] === 'c' ? Number(m[1]) : Number(m[1]) * 100 + Number(m[3] ?? 0); };
        run('mes.monnaie', 4, 300, (q) => {
            const prices = [...q.prompt.matchAll(/(\d+\u00a0€(?:\u00a0\d\d)?|\d+\u00a0c)(?=[ .])/g)].map(m => cents(m[1]));
            assert.equal(cents(q.answer), prices[2] - prices[0] - prices[1], q.prompt);
        });
    });
});

describe('anglais', () => {
    test('generate_EnglishLevelOne_InstructionsInFrench', () => {
        for (const skill of SKILLS.filter(s => s.id.startsWith('en.'))) {
            const rng = seeded(5);
            for (let i = 0; i < 100; i++) assert.match(generate(skill.id, 1, rng).prompt, /en anglais|se dit/, skill.id);
        }
    });
    test('generate_EnglishTranslations_OneWordPerMeaning', () => {
        // a French prompt word always maps to one English word, and no English word answers two different prompts
        const byAnswer = new Map();
        for (const skill of SKILLS.filter(s => s.id.startsWith('en.'))) {
            const rng = seeded(9);
            for (let i = 0; i < 400; i++) {
                const q = generate(skill.id, 1 + (i % 3), rng);
                const asked = q.prompt.match(/«\u00a0(.+?)\u00a0»|, (.+) se dit/);
                if (!asked || !/Comment dit-on|se dit/.test(q.prompt)) continue;
                const key = `${skill.id}|${q.level}|${q.answer}`;
                const word = asked[1] ?? asked[2];
                assert.equal(byAnswer.get(key) ?? word, word, `${key}: ${word}`);
                byAnswer.set(key, word);
            }
        }
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
