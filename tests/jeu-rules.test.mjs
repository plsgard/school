// tests/jeu-rules.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MASTERY, FAST, PROBE, PULLBACK, VERSION, askLevel, reachable, gateFront, RUN_QUESTIONS, RUN_BONUS, FRIEND_STARS, BIOMES, CATALOG, HEROES, PORTALS, SPAWN, MAX_STARS,
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
    test('PORTALS_OnePerBiome_GateAndItsFrontOnBuildFreeTiles', () => {
        assert.deepEqual(PORTALS.map(p => p.biome).sort(), BIOMES.map(b => b.id).sort());
        for (const p of PORTALS) {
            assert.equal(buildable(p.x, p.y), false, p.biome);
            assert.equal(buildable(gateFront(p).x, gateFront(p).y), false, p.biome);
        }
        assert.deepEqual(gateFront(PORTALS.find(p => p.biome === 'port')), { x: 16, y: 6 });
        assert.equal(buildable(SPAWN.x, SPAWN.y), false);
    });
    test('BIOMES_Look_EmojiNeverSharedBetweenLands', () => {
        const looks = BIOMES.flatMap(b => [...new Set([b.emoji, b.creature, b.prop, b.friend])]);
        assert.equal(new Set(looks).size, looks.length);
        assert.deepEqual(BIOMES.filter(b => b.steady).map(b => b.id), ['volcan']);
    });
    test('CATALOG_Ids_UniqueAndReachable', () => {
        assert.equal(new Set(CATALOG.map(i => i.id)).size, CATALOG.length);
        assert.equal(new Set(HEROES.map(h => h.id)).size, HEROES.length);
        for (const i of CATALOG) assert.ok(i.stars <= MAX_STARS && i.cost > 0, i.id);
    });
});

describe('ladder', () => {
    test('recordAnswer_NeverMissedAtTheLevel_FastCleanAnswersMoveUp', () => {
        const s = answer(defaultState(), 'calc.add', clean(FAST - 1));
        assert.equal(skillStars(s, 'calc.add'), 0);
        const r = recordAnswer(s, 'calc.add', true);
        assert.equal(r.star, true);
        assert.deepEqual(skillState(r.state, 'calc.add'), { lvl: 2, streak: 0, misses: 0, top: false, best: 1, n: FAST, ok: FAST, slips: [] });
    });
    test('recordAnswer_MissedAtTheLevel_NeedsMasteryInARow', () => {
        let s = answer(defaultState(), 'calc.add', [false, ...clean(MASTERY - 1)]);
        assert.deepEqual([skillState(s, 'calc.add').lvl, skillState(s, 'calc.add').slips], [1, [1]]);
        s = answer(s, 'calc.add', [true]);
        assert.equal(skillState(s, 'calc.add').lvl, 2);
        s = answer(s, 'calc.add', clean(FAST)); // level 2 was never missed: fast again
        assert.equal(skillState(s, 'calc.add').lvl, 3);
    });
    test('recordAnswer_SteadyLand_AlwaysNeedsMastery', () => {
        const s = answer(defaultState(), 'conj.present', clean(MASTERY - 1));
        assert.equal(skillState(s, 'conj.present').lvl, 1);
        assert.equal(skillState(answer(s, 'conj.present', [true]), 'conj.present').lvl, 2);
    });
    test('recordAnswer_AMiss_ResetsTheStreak', () => {
        const s = answer(defaultState(), 'calc.add', [...clean(FAST - 1), false, true]);
        assert.equal(skillState(s, 'calc.add').lvl, 1);
        assert.equal(skillState(s, 'calc.add').streak, 1);
    });
    test('recordAnswer_LastLevelMastered_IsTopWithAllStars', () => {
        const levels = skillById('lex.synonyme').levels;
        const s = answer(defaultState(), 'lex.synonyme', clean(FAST * levels));
        assert.equal(skillState(s, 'lex.synonyme').top, true);
        assert.equal(skillStars(s, 'lex.synonyme'), levels);
        assert.equal(recordAnswer(s, 'lex.synonyme', true).star, false);
    });
    test('recordAnswer_PullbackMissesInARow_MovesDownOneStep', () => {
        let s = answer(defaultState(), 'calc.add', clean(FAST));
        s = answer(s, 'calc.add', Array(PULLBACK).fill(false));
        assert.equal(skillState(s, 'calc.add').lvl, 1);
        s = answer(s, 'calc.add', Array(PULLBACK * 3).fill(false));
        assert.equal(skillState(s, 'calc.add').lvl, 1);
    });
    test('recordAnswer_TopThenPullback_LosesTopOnly', () => {
        const levels = skillById('lex.synonyme').levels;
        let s = answer(defaultState(), 'lex.synonyme', clean(FAST * levels));
        s = answer(s, 'lex.synonyme', Array(PULLBACK).fill(false));
        assert.deepEqual([skillState(s, 'lex.synonyme').lvl, skillState(s, 'lex.synonyme').top], [levels, false]);
    });
    test('recordAnswer_PullbackAfterAStar_KeepsTheStarAndNeverWinsItTwice', () => {
        let s = answer(defaultState(), 'calc.add', clean(FAST));
        s = answer(s, 'calc.add', Array(PULLBACK).fill(false));
        assert.deepEqual([skillState(s, 'calc.add').lvl, skillStars(s, 'calc.add'), totalStars(s)], [1, 1, 1]);
        const again = recordAnswer(answer(s, 'calc.add', clean(FAST - 1)), 'calc.add', true);
        assert.deepEqual([again.star, skillState(again.state, 'calc.add').lvl, skillStars(again.state, 'calc.add')], [false, 2, 1]);
    });
    test('askLevel_FirstQuestionOfASkill_IsAPlacementAtProbe', () => {
        assert.equal(askLevel(defaultState(), 'calc.add'), PROBE);
        assert.equal(askLevel(defaultState(), 'conj.present'), 1); // the Volcan des Verbes keeps its pace
        assert.equal(askLevel(answer(defaultState(), 'calc.add', [true]), 'calc.add'), 1);
    });
    test('recordAnswer_PlacementRight_StartsThereWithTheStarsBelow', () => {
        const r = recordAnswer(defaultState(), 'en.jours', true, PROBE);
        assert.equal(r.star, true);
        assert.deepEqual([skillState(r.state, 'en.jours').lvl, skillState(r.state, 'en.jours').streak, skillStars(r.state, 'en.jours')], [PROBE, 1, PROBE - 1]);
        const s = answer(r.state, 'en.jours', clean(FAST - 1));
        assert.equal(skillState(s, 'en.jours').lvl, PROBE + 1);
    });
    test('recordAnswer_PlacementWrong_CountsNothingAgainstHim', () => {
        const s = recordAnswer(defaultState(), 'en.jours', false, PROBE).state;
        assert.deepEqual(skillState(s, 'en.jours'), { lvl: 1, streak: 0, misses: 0, top: false, best: 0, n: 1, ok: 0, slips: [] });
        assert.equal(askLevel(s, 'en.jours'), 1);
    });
    test('recordAnswer_StrongChildOnANewSkill_TopAfterFewAnswers', () => {
        let s = defaultState();
        let asked = 0;
        while (!skillState(s, 'calc.add').top) { s = recordAnswer(s, 'calc.add', true, askLevel(s, 'calc.add')).state; asked++; }
        assert.equal(asked, 1 + (FAST - 1) + FAST * (skillById('calc.add').levels - PROBE));
        assert.ok(asked < MASTERY * skillById('calc.add').levels / 2);
    });
    test('skillState_SavedBeforeBest_StarsFollowTheLevel', () => {
        assert.equal(skillStars({ skills: { 'calc.add': { lvl: 3 } } }, 'calc.add'), 2);
    });
    test('skillState_SavedBeforeSlips_PendingMissMarksTheLevel', () => {
        assert.deepEqual(skillState({ skills: { 'calc.add': { lvl: 2, misses: 1 } } }, 'calc.add').slips, [2]);
        assert.deepEqual(skillState({ skills: { 'calc.add': { lvl: 2, streak: 1 } } }, 'calc.add').slips, []);
    });
    test('skillState_TopBeforeANewLevel_MovesOnWithTheSameStars', () => {
        const s = skillState({ skills: { 'calc.add': { lvl: 3, top: true, best: 3, streak: 2 } } }, 'calc.add');
        assert.deepEqual([s.lvl, s.top, s.best, s.streak], [4, false, 3, 0]);
    });
    test('stars_SumOverBiomes_MatchTotal', () => {
        let s = answer(defaultState(), 'calc.add', clean(FAST));
        s = answer(s, 'num.suite', clean(FAST * 2));
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
        for (const id of ['calc.add', 'calc.sub', 'calc.tables']) s = answer(s, id, clean(FAST * 4));
        const count = { 'calc.double': 0, 'calc.add': 0 };
        for (let i = 0; i < 200; i++) for (const p of composeExpedition({ state: s, biomeId: 'mine', rng: Math.random })) if (p.skill in count) count[p.skill]++;
        assert.ok(count['calc.double'] > count['calc.add'] * 1.5, JSON.stringify(count));
    });
    test('composeExpedition_StarsElsewhere_AddsReviewsAfterTheStart', () => {
        const s = answer(answer(defaultState(), 'calc.add', clean(FAST)), 'orth.pluriel', clean(FAST));
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
        s = answer(s, 'calc.add', clean(FAST * FRIEND_STARS));
        assert.deepEqual(friends(s), [{ biome: 'mine', emoji: '🦔' }]);
    });
});

describe('normalize', () => {
    test('normalize_Nothing_IsTheDefaultState', () => {
        assert.deepEqual(normalize(null), defaultState());
    });
    test('normalize_UnknownIdsAndBadNumbers_DroppedAndReservedTilesRefunded', () => {
        const s = normalize({ crystals: -4, hero: 'ghost', heroes: ['ghost', 'dog'], skills: { nope: {}, 'calc.add': { lvl: 2 } }, village: { '2,3': 'tree', '2,4': 'gone', '9,6': 'tree' }, settings: { maxRuns: 3 } });
        assert.equal(normalize({ settings: { maxRuns: 99 } }).settings.maxRuns, 6);
        assert.deepEqual([s.crystals, s.hero, s.heroes], [itemById('tree').cost, 'cat', ['cat', 'dog']]);
        assert.deepEqual(Object.keys(s.skills), ['calc.add']);
        assert.deepEqual(s.village, { '2,3': 'tree' });
        assert.deepEqual(s.settings, { maxRuns: 3, sound: true });
    });
    test('normalize_V1BuildingsOnTheNewGate_RefundedNotLost', () => {
        const s = normalize({ v: 1, crystals: 10, village: { '17,6': 'house', '16,6': 'path', '15,6': 'tulip', '2,3': 'tree' } });
        assert.deepEqual(s.village, { '2,3': 'tree', '15,6': 'tulip' }); // the tulip does not wall the gate in: kept
        assert.equal(s.crystals, 10 + itemById('house').cost + itemById('path').cost);
        assert.equal(s.v, VERSION);
    });
    test('normalize_V1NewGateWalledIn_ClearsTheWayFromTheSpawn', () => {
        const village = { '15,5': 'tree', '15,6': 'water', '15,7': 'tree', '16,5': 'tree', '16,7': 'tree', '17,5': 'tree', '17,7': 'tree', '12,6': 'path', '3,3': 'house' };
        const s = normalize({ v: 1, crystals: 0, village });
        assert.ok(reachable(s).has('17,6'));
        assert.equal(s.crystals, itemById('water').cost); // only the water on the way, the path is walkable
        assert.deepEqual(Object.keys(s.village).sort(), Object.keys(village).filter(k => k !== '15,6').sort());
    });
    test('normalize_V2Village_NeverTouchedEvenIfAGateIsWalledIn', () => {
        const village = { '15,5': 'tree', '15,6': 'tree', '15,7': 'tree', '16,5': 'tree', '16,7': 'tree', '17,5': 'tree', '17,7': 'tree' };
        const s = normalize({ v: VERSION, crystals: 0, village });
        assert.deepEqual([s.village, s.crystals], [village, 0]);
    });
    test('normalize_SaveFromBeforeTheChange_SameStarsEverywhere', () => {
        // a v1 save: levels 1–3, one skill on top, a pending miss, no `slips`
        const skills = {
            'calc.add': { lvl: 3, streak: 1, misses: 0, top: true, best: 3, n: 30, ok: 27 },
            'num.suite': { lvl: 2, streak: 3, misses: 0, top: false, best: 1, n: 9, ok: 8 },
            'conj.temps': { lvl: 2, streak: 0, misses: 1, top: true, best: 2, n: 12, ok: 10 },
            'orth.pluriel': { lvl: 1, streak: 0, misses: 1, top: false, best: 2, n: 14, ok: 9 },
            'mes.heure': { lvl: 2 },
        };
        const s = normalize({ v: 1, crystals: 42, skills, village: {} });
        assert.deepEqual(Object.fromEntries(Object.keys(skills).map(id => [id, skillStars(s, id)])),
            { 'calc.add': 3, 'num.suite': 1, 'conj.temps': 2, 'orth.pluriel': 2, 'mes.heure': 1 });
        assert.equal(totalStars(s), 9);
        assert.equal(s.crystals, 42);
        assert.deepEqual([skillState(s, 'calc.add').lvl, askLevel(s, 'calc.add')], [4, 4]);
        assert.equal(askLevel(s, 'num.suite'), 2);
    });
});
