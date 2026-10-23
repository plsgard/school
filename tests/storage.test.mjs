// tests/storage.test.mjs
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

const ls = installFakeLocalStorage();
const s = await import('../assets/storage.js');

beforeEach(() => ls.clear());

describe('getActiveProfileId', () => {
    test('getActiveProfileId_StorageAccessThrows_ReturnsDefault', () => {
        const get = ls.getItem;
        ls.getItem = () => { throw new Error('SecurityError'); };
        try { assert.equal(s.getActiveProfileId(), 'default'); } finally { ls.getItem = get; }
    });
});

describe('profiles', () => {
    test('loadProfiles_WhenEmpty_ReturnsEmptyArray', () => {
        assert.deepEqual(s.loadProfiles(), []);
    });
    test('saveProfiles_ThenLoad_RoundTrips', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        assert.equal(s.loadProfiles()[0].id, 'lou');
    });
    test('setActiveProfileId_ThenGet_ReturnsIt', () => {
        s.setActiveProfileId('lou');
        assert.equal(s.getActiveProfileId(), 'lou');
    });
});

describe('settings', () => {
    test('loadSettings_WhenEmpty_ReturnsDefaults', () => {
        assert.deepEqual(s.loadSettings('lou'), { sessionItems: 6, practiceItems: 6, parentMode: null, firstName: '', audio: 'clips', voice: '' });
    });
    test('saveSettings_MergesOverDefaults', () => {
        s.saveSettings('lou', { firstName: 'Lou' });
        assert.equal(s.loadSettings('lou').firstName, 'Lou');
        assert.equal(s.loadSettings('lou').sessionItems, 6);
    });
});

describe('srs', () => {
    test('loadSrs_WhenEmpty_ReturnsEmptyShape', () => {
        assert.deepEqual(s.loadSrs('lou', 'gs'), { cards: {}, introduced: {} });
    });
    test('saveSrs_UsesExplicitProfileNotActiveOne', () => {
        s.setActiveProfileId('tom');
        s.saveSrs('lou', 'gs', { cards: { 'x#y': { box: 1 } }, introduced: {} });
        assert.equal(s.loadSrs('lou', 'gs').cards['x#y'].box, 1);
        assert.deepEqual(s.loadSrs('tom', 'gs'), { cards: {}, introduced: {} });
    });
});

describe('sessions', () => {
    test('appendSession_KeepsNewestFirstAndCapsAt14', () => {
        for (let i = 0; i < 16; i++) s.appendSession('lou', 'gs', { date: `d${i}`, items: [] });
        const all = s.loadSessions('lou', 'gs');
        assert.equal(all.length, 14);
        assert.equal(all[0].date, 'd15');
    });
});

describe('practice', () => {
    test('loadPractice_WhenEmpty_ReturnsEmptyArray', () => {
        assert.deepEqual(s.loadPractice('lou', 'gs'), []);
    });
    test('appendPractice_KeepsNewestFirstAndCapsAt30', () => {
        for (let i = 0; i < 32; i++) s.appendPractice('lou', 'gs', { date: `d${i}`, theme: 'sons', items: [] });
        const all = s.loadPractice('lou', 'gs');
        assert.equal(all.length, 30);
        assert.equal(all[0].date, 'd31');
    });
    test('appendPractice_Always_LeavesDailySessionsUntouched', () => {
        s.appendSession('lou', 'gs', { date: 'today', items: [] });
        for (let i = 0; i < 20; i++) s.appendPractice('lou', 'gs', { date: `p${i}`, theme: 'nombres', items: [] });
        assert.deepEqual(s.loadSessions('lou', 'gs').map(x => x.date), ['today']);
    });
    test('appendPractice_UsesExplicitProfileNotActiveOne', () => {
        s.setActiveProfileId('tom');
        s.appendPractice('lou', 'gs', { date: 'd', theme: 'sons', items: [] });
        assert.deepEqual(s.loadPractice('tom', 'gs'), []);
    });
});

describe('historyProfileId', () => {
    const profiles = [{ id: 'kid-gs', track: 'gs' }, { id: 'default', track: 'en' }, { id: 'ado', track: 'en' }];
    test('historyProfileId_NoProfiles_ReturnsActive', () => {
        assert.equal(s.historyProfileId([], 'default'), 'default');
        assert.equal(s.historyProfileId([], 'legacy'), 'legacy');
    });
    test('historyProfileId_ActiveIsEnTrack_ReturnsActive', () => {
        assert.equal(s.historyProfileId(profiles, 'ado'), 'ado');
    });
    test('historyProfileId_ActiveIsGsTrack_ReturnsDefault', () => {
        assert.equal(s.historyProfileId(profiles, 'kid-gs'), 'default');
    });
    test('historyProfileId_ActiveUnknown_ReturnsDefault', () => {
        assert.equal(s.historyProfileId(profiles, 'gone'), 'default');
    });
});

