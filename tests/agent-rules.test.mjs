import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    GAME_ID, PAY, RANK_XP, RANKS, CATALOG, normalize, rollDay, canStart, beginMission, quitMission, payLock, finishMission,
    pickPriority, rankOf, buy, equip, collectChip, streak, persist, localDay,
} from '../assets/agent/rules.js';

const TODAY = '2026-11-20';
const fresh = (patch = {}) => ({ ...normalize(null, { lessonIds: ['a', 'b', 'c'] }), day: TODAY, ...patch });

describe('tables', () => {
    test('CATALOG_TenItems_WithTheGadgetsAndTheBoard', () => {
        assert.equal(GAME_ID, 'agent');
        assert.equal(CATALOG.length, 10);
        assert.equal(RANKS.length, RANK_XP.length);
        const by = Object.fromEntries(CATALOG.map(i => [i.id, i]));
        assert.deepEqual([by.emp.rank, by.emp.cost, by.hint.rank, by.hint.cost, by.board.rank, by.board.cost], [1, 80, 2, 120, 4, 300]);
        assert.deepEqual([by.classic.kind, by.classic.rank, by.classic.cost], ['outfit', 0, 0]);
        assert.equal(CATALOG.filter(i => i.kind === 'outfit').length, 7);
    });
});

describe('normalize', () => {
    test('normalize_Null_ReturnsDefaults', () => {
        const s = normalize(null, { lessonIds: [] });
        assert.deepEqual(s, { v: 1, credits: 0, xp: 0, owned: ['classic'], equipped: { outfit: 'classic', gadget: null }, chips: [], day: null,
            missionsToday: 0, priority: { day: null, ids: [], done: [] }, missions: {}, days: {}, settings: { maxMissions: 6, sound: true }, seenIntro: false });
    });
    test('normalize_UnknownIds_AreDropped', () => {
        const s = normalize({
            owned: ['classic', 'emp', 'jetpack'], equipped: { outfit: 'jetpack', gadget: 'emp' }, chips: ['chip-1', 'chip-99'],
            priority: { day: TODAY, ids: ['a', 'zz'], done: ['zz'] }, missions: { a: { runs: 1, bestStars: 2, lastType: 'sort', last: '2026-11-19' }, zz: { runs: 3 } },
        }, { lessonIds: ['a'], chipIds: ['chip-1'] });
        assert.deepEqual(s.owned, ['classic', 'emp']);
        assert.deepEqual(s.equipped, { outfit: 'classic', gadget: 'emp' });
        assert.deepEqual(s.chips, ['chip-1']);
        assert.deepEqual(s.priority, { day: TODAY, ids: ['a'], done: [] });
        assert.deepEqual(s.missions, { a: { runs: 1, bestStars: 2, lastType: 'sort', last: '2026-11-19' } });
    });
    test('normalize_MaxMissionsOutOfRange_IsClamped', () => {
        assert.equal(normalize({ settings: { maxMissions: 40 } }, { lessonIds: [] }).settings.maxMissions, 12);
        assert.equal(normalize({ settings: { maxMissions: 0 } }, { lessonIds: [] }).settings.maxMissions, 1);
    });
    test('normalize_MaxMissionsNullOrUnknownKeys_DefaultAndDropped', () => {
        const s = normalize({ settings: { maxMissions: null, junk: 1 } }, { lessonIds: [] });
        assert.deepEqual(s.settings, { maxMissions: 6, sound: true });
        assert.equal(normalize({ settings: { maxMissions: '' } }, { lessonIds: [] }).settings.maxMissions, 6);
    });
    test('normalize_ManyDays_KeepsTheLast30', () => {
        const days = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, { missions: 1, locks: 10, firstTry: 5 }]));
        const kept = Object.keys(normalize({ days }, { lessonIds: [] }).days);
        assert.equal(kept.length, 30);
        assert.equal(kept[0], '2026-10-11');
    });
    test('normalize_NegativeOrJunkNumbers_BecomeZero', () => {
        const s = normalize({ credits: -5, xp: 'x' }, { lessonIds: [] });
        assert.deepEqual([s.credits, s.xp], [0, 0]);
    });
});

describe('day and cap', () => {
    test('rollDay_NewDay_ResetsMissionsAndPriority', () => {
        const s = rollDay(fresh({ missionsToday: 4, priority: { day: TODAY, ids: ['a'], done: ['a'] } }), '2026-11-21');
        assert.deepEqual([s.day, s.missionsToday, s.priority], ['2026-11-21', 0, { day: null, ids: [], done: [] }]);
    });
    test('rollDay_SameDay_ReturnsSameCounts', () => {
        const s = fresh({ missionsToday: 4 });
        assert.equal(rollDay(s, TODAY), s);
    });
    test('canStart_CapReached_ReturnsFalse', () => {
        assert.equal(canStart(fresh({ missionsToday: 6 })), false);
        assert.equal(canStart(fresh({ missionsToday: 5 })), true);
    });
    test('beginMission_CountsTheMissionWhenItStarts', () => {
        const s = beginMission(fresh(), { lessonId: 'a', type: 'sort', today: TODAY });
        assert.equal(s.missionsToday, 1);
        assert.deepEqual(s.missions.a, { runs: 1, bestStars: 0, lastType: 'sort', last: TODAY });
        assert.deepEqual(s.days[TODAY], { missions: 1, locks: 0, firstTry: 0 });
    });
    test('quitMission_AddsTheLocksWithoutPay', () => {
        const s = quitMission(beginMission(fresh(), { lessonId: 'a', type: 'sort', today: TODAY }), { today: TODAY, locks: 3, firstTry: 2 });
        assert.deepEqual([s.days[TODAY], s.credits], [{ missions: 1, locks: 3, firstTry: 2 }, 0]);
    });
});

describe('pay', () => {
    test('payLock_UnrecordedRight_PaysToken', () => {
        const { state, credits } = payLock(fresh(), { result: 'right', recorded: false, masteredNow: false });
        assert.deepEqual([credits, state.credits, state.xp], [1, 1, 1]);
    });
    test('payLock_UnrecordedMiss_Pays0', () => {
        assert.equal(payLock(fresh(), { result: 'miss', recorded: false, masteredNow: false }).credits, 0);
    });
    test('payLock_RecordedRightMasteredNow_Pays20', () => {
        assert.equal(payLock(fresh(), { result: 'right', recorded: true, masteredNow: true }).credits, 20);
    });
    test('payLock_RecordedRetry_Pays2', () => {
        assert.equal(payLock(fresh(), { result: 'retry', recorded: true, masteredNow: false }).credits, 2);
    });
    test('payLock_Miss_Pays0', () => {
        assert.equal(payLock(fresh(), { result: 'miss', recorded: true, masteredNow: false }).credits, 0);
    });
    test('finishMission_NeverCaught_AddsStealthBonus', () => {
        const { credits } = finishMission(fresh(), { lessonId: 'a', stars: 2, runCredits: 30, today: TODAY, locks: 10, firstTry: 6, caught: 0 });
        assert.equal(credits, 2 * PAY.star + PAY.stealth);
    });
    test('finishMission_NoStar_NoStealthBonus', () => {
        assert.equal(finishMission(fresh(), { lessonId: 'a', stars: 0, runCredits: 3, today: TODAY, locks: 10, firstTry: 0, caught: 0 }).credits, 0);
    });
    test('finishMission_PriorityFirstRun_PaysTheRunTwice', () => {
        const s = fresh({ priority: { day: TODAY, ids: ['a'], done: [] } });
        const { state, credits } = finishMission(s, { lessonId: 'a', stars: 3, runCredits: 40, today: TODAY, locks: 10, firstTry: 7, caught: 1 });
        assert.equal(credits, 30 + 40 + 30);
        assert.deepEqual(state.priority.done, ['a']);
    });
    test('finishMission_PrioritySecondRun_PaysOnce', () => {
        const s = fresh({ priority: { day: TODAY, ids: ['a'], done: ['a'] } });
        assert.equal(finishMission(s, { lessonId: 'a', stars: 3, runCredits: 40, today: TODAY, locks: 10, firstTry: 7, caught: 1 }).credits, 30);
    });
    test('finishMission_UpdatesBestStarsAndTheDay', () => {
        let s = beginMission(fresh(), { lessonId: 'a', type: 'infiltration', today: TODAY });
        s = finishMission(s, { lessonId: 'a', stars: 2, runCredits: 0, today: TODAY, locks: 10, firstTry: 5, caught: 2 }).state;
        s = finishMission(s, { lessonId: 'a', stars: 1, runCredits: 0, today: TODAY, locks: 10, firstTry: 3, caught: 2 }).state;
        assert.equal(s.missions.a.bestStars, 2);
        assert.deepEqual(s.days[TODAY], { missions: 1, locks: 20, firstTry: 8 });
    });
    test('finishMission_CrossesRankThreshold_ReturnsRankUp', () => {
        const { state, rankUp } = finishMission(fresh({ xp: 55 }), { lessonId: 'a', stars: 2, runCredits: 0, today: TODAY, locks: 10, firstTry: 5, caught: 1 });
        assert.deepEqual([state.xp, rankOf(state.xp), rankUp], [75, 1, true]);
    });
    test('finishMission_RunCreditsCrossedTheThreshold_ReturnsRankUp', () => {
        // xp went 50 → 62 lock by lock during the run; the debrief still announces the new rank.
        assert.equal(finishMission(fresh({ xp: 62 }), { lessonId: 'a', stars: 0, runCredits: 12, today: TODAY, locks: 10, firstTry: 0, caught: 1 }).rankUp, true);
    });
});

describe('priority', () => {
    test('pickPriority_TestInThreeDays_ComesFirst', () => {
        const ids = pickPriority([
            { id: 'a', exam: null, need: 9, lastPlayed: null },
            { id: 'b', exam: '2026-11-23', need: 0, lastPlayed: TODAY },
            { id: 'c', exam: '2026-12-25', need: 2, lastPlayed: null },
        ], TODAY);
        assert.deepEqual(ids, ['b', 'a', 'c']);
    });
    test('pickPriority_NothingNeeded_PrefersNeverPlayed', () => {
        const ids = pickPriority([
            { id: 'a', exam: null, need: 0, lastPlayed: '2026-11-10' },
            { id: 'b', exam: null, need: 0, lastPlayed: null },
            { id: 'c', exam: null, need: 0, lastPlayed: '2026-11-01' },
            { id: 'd', exam: null, need: 0, lastPlayed: '2026-11-19' },
        ], TODAY);
        assert.deepEqual(ids, ['b', 'c', 'a']);
    });
    test('pickPriority_PastExam_IsNotSoon', () => {
        assert.deepEqual(pickPriority([{ id: 'a', exam: '2026-11-13', need: 0, lastPlayed: TODAY }, { id: 'b', exam: null, need: 1, lastPlayed: TODAY }], TODAY), ['b', 'a']);
    });
});

describe('shop', () => {
    test('rankOf_Thresholds_ReturnsTheIndex', () => {
        assert.deepEqual([rankOf(0), rankOf(59), rankOf(60), rankOf(5000)], [0, 0, 1, 9]);
    });
    test('buy_RankTooLow_LeavesStateUnchanged', () => {
        const s = fresh({ credits: 500, xp: 0 });
        assert.equal(buy(s, 'emp'), s);
    });
    test('buy_NotEnoughCredits_LeavesStateUnchanged', () => {
        const s = fresh({ credits: 79, xp: 60 });
        assert.equal(buy(s, 'emp'), s);
    });
    test('buy_Affordable_TakesCreditsNotXp', () => {
        const s = buy(fresh({ credits: 100, xp: 60 }), 'emp');
        assert.deepEqual([s.credits, s.xp, s.owned], [20, 60, ['classic', 'emp']]);
    });
    test('buy_AlreadyOwned_LeavesStateUnchanged', () => {
        const s = fresh({ credits: 100, xp: 60, owned: ['classic', 'emp'] });
        assert.equal(buy(s, 'emp'), s);
    });
    test('equip_OwnedGadgetAndOutfit_AreEquipped', () => {
        let s = fresh({ owned: ['classic', 'emp', 'night'] });
        s = equip(equip(s, 'emp'), 'night');
        assert.deepEqual(s.equipped, { outfit: 'night', gadget: 'emp' });
        assert.deepEqual(equip(s, 'emp').equipped.gadget, null);
    });
    test('equip_NotOwned_LeavesStateUnchanged', () => {
        const s = fresh();
        assert.equal(equip(s, 'hint'), s);
    });
    test('collectChip_Twice_PaysOnce', () => {
        const a = collectChip(fresh(), 'chip-1');
        const b = collectChip(a.state, 'chip-1');
        assert.deepEqual([a.credits, b.credits, b.state.credits, b.state.xp], [PAY.chip, 0, PAY.chip, 0]);
    });
});

describe('streak and save', () => {
    test('streak_PlayedYesterdayAndToday_Returns2', () => {
        assert.equal(streak({ '2026-11-19': { missions: 1 }, [TODAY]: { missions: 2 }, '2026-11-17': { missions: 1 } }, TODAY), 2);
    });
    test('streak_LastPlayedYesterday_StillCounts', () => {
        assert.equal(streak({ '2026-11-18': { missions: 1 }, '2026-11-19': { missions: 1 } }, TODAY), 2);
    });
    test('streak_GapOfTwoDays_Returns0', () => {
        assert.equal(streak({ '2026-11-17': { missions: 1 } }, TODAY), 0);
    });
    test('persist_SaveThrows_ReturnsFalse', () => {
        assert.equal(persist(() => { throw new Error('QuotaExceededError'); }, fresh()), false);
        assert.equal(persist(() => {}, fresh()), true);
    });
    test('localDay_Date_ReturnsLocalYmd', () => {
        assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    });
});
