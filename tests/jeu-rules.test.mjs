// tests/jeu-rules.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MASTERY, PULLBACK, RUN_QUESTIONS, RUN_BONUS, FRIEND_STARS, BIOMES, CATALOG, HEROES, PORTALS, SPAWN, MAX_STARS,
    defaultState, normalize, skillState, skillStars, biomeStars, totalStars, recordAnswer, composeExpedition, bonusBiome,
    isBonus, withDailyBonus, beginRun, canRun, crystalsFor, finishRun, runsToday, buildable, isSolid, place, remove, buyHero, friends, itemById,
} from '../assets/jeu/rules.js';
import { SKILLS, skillById } from '../assets/jeu/questions.js';

const day = '2026-11-13';
const answer = (state, skill, outcomes) => outcomes.reduce((s, clean) => recordAnswer(s, skill, clean).state, state);
const clean = (n) => Array(n).fill(true);
const rngOf = (values) => { let i = 0; return () => values[i++ % values.length]; };

describe('catalog', () => {
    test('BIOMES_AllSkills_BelongToExactlyOneBiome', () => {
        const all = BIOMES.flatMap(b => b.skills);
        assert.equal(new Set(all).size, all.length);
        assert.deepEqual([...all].sort(), SKILLS.map(s => s.id).sort());
    });
    test('PORTALS_OnePerBiome_OnBuildFreeTiles', () => {
        assert.deepEqual(PORTALS.map(p => p.biome).sort(), BIOMES.map(b => b.id).sort());
        for (const p of PORTALS) assert.equal(buildable(p.x, p.y), false);
        assert.equal(buildable(SPAWN.x, SPAWN.y), false);
    });
    test('CATALOG_Ids_UniqueAndReachable', () => {
        assert.equal(new Set(CATALOG.map(i => i.id)).size, CATALOG.length);
        assert.equal(new Set(HEROES.map(h => h.id)).size, HEROES.length);
        for (const i of CATALOG) assert.ok(i.stars <= MAX_STARS && i.cost > 0, i.id);
    });
});

describe('ladder', () => {
    test('recordAnswer_MasteryCleanInARow_WinsAStarAndMovesUp', () => {
        let s = answer(defaultState(), 'calc.add', clean(MASTERY - 1));
        assert.equal(skillStars(s, 'calc.add'), 0);
        const r = recordAnswer(s, 'calc.add', true);
        assert.equal(r.star, true);
        assert.deepEqual(skillState(r.state, 'calc.add'), { lvl: 2, streak: 0, misses: 0, top: false, best: 1, n: MASTERY, ok: MASTERY });
    });
    test('recordAnswer_AMiss_ResetsTheStreak', () => {
        const s = answer(defaultState(), 'calc.add', [...clean(MASTERY - 1), false, true]);
        assert.equal(skillState(s, 'calc.add').lvl, 1);
        assert.equal(skillState(s, 'calc.add').streak, 1);
    });
    test('recordAnswer_LastLevelMastered_IsTopWithAllStars', () => {
        const levels = skillById('conj.temps').levels;
        const s = answer(defaultState(), 'conj.temps', clean(MASTERY * levels));
        assert.equal(skillState(s, 'conj.temps').top, true);
        assert.equal(skillStars(s, 'conj.temps'), levels);
        assert.equal(recordAnswer(answer(s, 'conj.temps', clean(MASTERY - 1)), 'conj.temps', true).star, false);
    });
    test('recordAnswer_PullbackMissesInARow_MovesDownOneStep', () => {
        let s = answer(defaultState(), 'calc.add', clean(MASTERY));
        s = answer(s, 'calc.add', Array(PULLBACK).fill(false));
        assert.equal(skillState(s, 'calc.add').lvl, 1);
        s = answer(s, 'calc.add', Array(PULLBACK * 3).fill(false));
        assert.equal(skillState(s, 'calc.add').lvl, 1);
    });
    test('recordAnswer_TopThenPullback_LosesTopOnly', () => {
        const levels = skillById('conj.temps').levels;
        let s = answer(defaultState(), 'conj.temps', clean(MASTERY * levels));
        s = answer(s, 'conj.temps', Array(PULLBACK).fill(false));
        assert.deepEqual([skillState(s, 'conj.temps').lvl, skillState(s, 'conj.temps').top], [levels, false]);
    });
    test('recordAnswer_PullbackAfterAStar_KeepsTheStarAndNeverWinsItTwice', () => {
        let s = answer(defaultState(), 'calc.add', clean(MASTERY));
        s = answer(s, 'calc.add', Array(PULLBACK).fill(false));
        assert.deepEqual([skillState(s, 'calc.add').lvl, skillStars(s, 'calc.add'), totalStars(s)], [1, 1, 1]);
        const again = recordAnswer(answer(s, 'calc.add', clean(MASTERY - 1)), 'calc.add', true);
        assert.deepEqual([again.star, skillState(again.state, 'calc.add').lvl, skillStars(again.state, 'calc.add')], [false, 2, 1]);
    });
    test('skillState_SavedBeforeBest_StarsFollowTheLevel', () => {
        assert.equal(skillStars({ skills: { 'calc.add': { lvl: 3 } } }, 'calc.add'), 2);
    });
    test('stars_SumOverBiomes_MatchTotal', () => {
        let s = answer(defaultState(), 'calc.add', clean(MASTERY));
        s = answer(s, 'num.suite', clean(MASTERY * 2));
        assert.equal(biomeStars(s, 'mine'), 1);
        assert.equal(biomeStars(s, 'foret'), 2);
        assert.equal(totalStars(s), 3);
    });
    test('skillState_CorruptLevel_RestartsAtOne', () => {
        assert.equal(skillState({ skills: { 'calc.add': { lvl: 12 } } }, 'calc.add').lvl, 1);
    });
});

describe('expeditions', () => {
    test('composeExpedition_NewPlayer_EightSkillsOfTheBiomeNeverTwiceInARow', () => {
        const plan = composeExpedition({ state: defaultState(), biomeId: 'mine', rng: Math.random });
        assert.equal(plan.length, RUN_QUESTIONS);
        const skills = BIOMES.find(b => b.id === 'mine').skills;
        plan.forEach((p, i) => {
            assert.ok(skills.includes(p.skill) && !p.review);
            if (i) assert.notEqual(p.skill, plan[i - 1].skill);
        });
    });
    test('composeExpedition_WeakSkills_ComeMoreOften', () => {
        let s = defaultState();
        for (const id of ['calc.add', 'calc.sub', 'calc.tables']) s = answer(s, id, clean(MASTERY * 3));
        const count = { 'calc.double': 0, 'calc.add': 0 };
        for (let i = 0; i < 200; i++) for (const p of composeExpedition({ state: s, biomeId: 'mine', rng: Math.random })) if (p.skill in count) count[p.skill]++;
        assert.ok(count['calc.double'] > count['calc.add'] * 1.5, JSON.stringify(count));
    });
    test('composeExpedition_StarsElsewhere_AddsReviewsAfterTheStart', () => {
        const s = answer(answer(defaultState(), 'calc.add', clean(MASTERY)), 'orth.pluriel', clean(MASTERY));
        const plan = composeExpedition({ state: s, biomeId: 'foret', rng: Math.random });
        const reviews = plan.map((p, i) => (p.review ? i : -1)).filter(i => i >= 0);
        assert.deepEqual(reviews, [3, 6]);
        assert.deepEqual(reviews.map(i => plan[i].skill).sort(), ['calc.add', 'orth.pluriel']);
    });
    test('bonusBiome_FewestStarsThenLongestAgo_Wins', () => {
        assert.equal(bonusBiome(defaultState()), 'foret');
        assert.equal(bonusBiome({ ...defaultState(), lastPlayed: { foret: day } }), 'mine');
    });
    test('withDailyBonus_SameDay_KeepsTheGateEvenOncePlayed', () => {
        let s = withDailyBonus(defaultState(), day);
        assert.equal(isBonus(s, 'foret', day), true);
        s = withDailyBonus(finishRun(s, { biomeId: 'foret', crystals: 0, bonus: true }, day).state, day);
        assert.equal(s.bonusBiome, 'foret');
        assert.deepEqual(BIOMES.map(b => isBonus(s, b.id, day)), Array(BIOMES.length).fill(false));
        assert.equal(withDailyBonus(s, '2026-11-14').bonusBiome, 'mine');
    });
    test('crystalsFor_CleanWithCombo_CappedBonus', () => {
        assert.equal(crystalsFor({ clean: true, combo: 1 }), 3);
        assert.equal(crystalsFor({ clean: true, combo: 3 }), 5);
        assert.equal(crystalsFor({ clean: true, combo: 12 }), 6);
        assert.equal(crystalsFor({ clean: false, combo: 0 }), 1);
    });
    test('finishRun_Bonus_DoublesTheCrystals', () => {
        const r = finishRun(defaultState(), { biomeId: 'mine', crystals: 20, bonus: true }, day);
        assert.equal(r.earned, (20 + RUN_BONUS) * 2);
        assert.deepEqual([r.state.crystals, r.state.lastPlayed.mine], [r.earned, day]);
    });
    test('finishRun_LeftEarly_KeepsThePickedCrystalsOnly', () => {
        const r = finishRun(defaultState(), { biomeId: 'mine', crystals: 7, bonus: true, finished: false }, day);
        assert.deepEqual([r.earned, r.state.crystals, r.state.lastPlayed], [7, 7, {}]);
    });
    test('beginRun_EveryStart_CountsForTheDay', () => {
        let s = { ...defaultState(), settings: { maxRuns: 2, sound: true } };
        s = beginRun(s, day);
        assert.deepEqual([runsToday(s, day), s.runs, canRun(s, day)], [1, 1, true]);
        s = beginRun(s, day); // even if the child then goes home early
        assert.equal(canRun(s, day), false);
        assert.equal(canRun(s, '2026-11-14'), true);
        assert.equal(runsToday(beginRun(s, '2026-11-14'), '2026-11-14'), 1);
        assert.equal(canRun({ ...s, settings: { maxRuns: 0 } }, day), true);
    });
});

describe('village', () => {
    const rich = () => ({ ...defaultState(), crystals: 100 });
    test('place_FreeTileAndEnoughCrystals_PaysAndBuilds', () => {
        const s = place(rich(), 2, 3, 'tree');
        assert.equal(s.crystals, 100 - itemById('tree').cost);
        assert.equal(isSolid(s, 2, 3), true);
    });
    test('place_TakenReservedLockedOrTooExpensive_ReturnsNull', () => {
        const s = place(rich(), 2, 3, 'tree');
        assert.equal(place(s, 2, 3, 'tulip'), null);
        assert.equal(place(rich(), SPAWN.x, SPAWN.y, 'tree'), null);
        assert.equal(place(rich(), 3, 1, 'tree'), null); // in front of a gate
        assert.equal(place(rich(), 2, 3, 'castle'), null);
        assert.equal(place(defaultState(), 2, 3, 'tree'), null);
        assert.equal(place(rich(), 99, 3, 'tree'), null);
    });
    test('remove_BuiltTile_GivesTheCrystalsBack', () => {
        const s = remove(place(rich(), 2, 3, 'tree'), 2, 3);
        assert.deepEqual([s.crystals, s.village], [100, {}]);
        assert.equal(remove(rich(), 2, 3), null);
    });
    test('isSolid_GroundAndWaterAndEdges_OnlyPathIsWalkable', () => {
        const s = place(rich(), 2, 3, 'path');
        assert.equal(isSolid(s, 2, 3), false);
        assert.equal(isSolid(s, 5, 5), false);
        assert.equal(isSolid(s, -1, 5), true);
        assert.equal(isSolid({ ...s, village: { '4,4': 'water' } }, 4, 4), true);
    });
    test('buyHero_NewOwnedOrTooExpensive_BuysSelectsOrRefuses', () => {
        const s = buyHero(rich(), 'dog');
        assert.deepEqual([s.hero, s.heroes, s.crystals], ['dog', ['cat', 'dog'], 70]);
        assert.equal(buyHero(s, 'cat').crystals, 70);
        assert.equal(buyHero(s, 'cat').hero, 'cat');
        assert.equal(buyHero(s, 'wizard'), null);
    });
    test('friends_BiomeWithEnoughStars_FreesItsFriend', () => {
        let s = defaultState();
        assert.deepEqual(friends(s), []);
        s = answer(s, 'calc.add', clean(MASTERY * FRIEND_STARS));
        assert.deepEqual(friends(s), [{ biome: 'mine', emoji: '🦔' }]);
    });
});

describe('normalize', () => {
    test('normalize_Nothing_IsTheDefaultState', () => {
        assert.deepEqual(normalize(null), defaultState());
    });
    test('normalize_UnknownIdsAndBadNumbers_Dropped', () => {
        const s = normalize({ crystals: -4, hero: 'ghost', heroes: ['ghost', 'dog'], skills: { nope: {}, 'calc.add': { lvl: 2 } }, village: { '2,3': 'tree', '2,4': 'gone', '9,6': 'tree' }, settings: { maxRuns: 3 } });
        assert.equal(normalize({ settings: { maxRuns: 99 } }).settings.maxRuns, 6);
        assert.deepEqual([s.crystals, s.hero, s.heroes], [0, 'cat', ['cat', 'dog']]);
        assert.deepEqual(Object.keys(s.skills), ['calc.add']);
        assert.deepEqual(s.village, { '2,3': 'tree' });
        assert.deepEqual(s.settings, { maxRuns: 3, sound: true });
    });
});
