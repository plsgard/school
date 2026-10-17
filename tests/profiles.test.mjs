// tests/profiles.test.mjs
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

const ls = installFakeLocalStorage();
const s = await import('../assets/storage.js');
const p = await import('../assets/profiles.js');

beforeEach(() => ls.clear());

describe('ensureProfiles', () => {
    test('ensureProfiles_NothingStored_SeedsGsAndDefaultProfiles', () => {
        const profiles = p.ensureProfiles();
        assert.deepEqual(profiles.map(x => [x.id, x.track]), [['kid-gs', 'gs'], ['default', 'en']]);
        assert.deepEqual(s.loadProfiles(), profiles);
    });
    test('ensureProfiles_NothingStored_SeedsApollineAndLouisAsRealNames', () => {
        const profiles = p.ensureProfiles();
        assert.deepEqual(profiles.map(x => [x.id, x.name, x.placeholder ?? false]), [['kid-gs', 'Apolline', false], ['default', 'Louis', false]]);
    });
    test('ensureProfiles_LegacySeededPlaceholders_TakeTheDefaultNames', () => {
        s.saveProfiles([
            { id: 'kid-gs', name: 'Enfant 1', avatar: '🦊', track: 'gs', placeholder: true },
            { id: 'default', name: 'Enfant 2', avatar: '🐼', track: 'en', placeholder: true },
        ]);
        const profiles = p.ensureProfiles();
        assert.deepEqual(profiles.map(x => [x.id, x.name, x.placeholder ?? false]), [['kid-gs', 'Apolline', false], ['default', 'Louis', false]]);
        assert.deepEqual(s.loadProfiles(), profiles);
    });
    test('ensureProfiles_ProfilesRenamedByAParent_KeepsTheirNames', () => {
        s.saveProfiles([{ id: 'kid-gs', name: 'Lou', avatar: '🦊', track: 'gs' }, { id: 'default', name: 'Enfant 2', avatar: '🐼', track: 'en' }]);
        assert.deepEqual(p.ensureProfiles().map(x => x.name), ['Lou', 'Enfant 2']);
    });
    test('ensureProfiles_ProfilesStored_KeepsThem', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        assert.deepEqual(p.ensureProfiles().map(x => x.id), ['lou']);
    });
});

describe('selectProfile', () => {
    test('selectProfile_PandaWithHistoryUnderDefault_StillLoadsThatHistory', () => {
        s.saveResult('addition', { score: 4, totalQuestions: 5 }, 'default'); // the older child's existing history
        const profiles = p.ensureProfiles();
        const panda = profiles.find(x => x.avatar === '🐼');
        assert.equal(p.selectProfile(profiles, panda.id), 'en.html'); // the English track; the math list stays one link away
        assert.equal(s.getActiveProfileId(), 'default');
        assert.equal(s.loadHistory('addition')[0].score, 4);
    });
    test('selectProfile_GsProfile_ActivatesItAndReturnsGsPage', () => {
        const profiles = p.ensureProfiles();
        assert.equal(p.selectProfile(profiles, 'kid-gs'), 'gs.html');
        assert.equal(s.getActiveProfileId(), 'kid-gs');
    });
});

describe('renameProfile', () => {
    test('renameProfile_FirstNameEmpty_SetsNameAndFirstName', () => {
        p.ensureProfiles();
        p.renameProfile('kid-gs', 'Lou');
        assert.equal(s.loadProfiles().find(x => x.id === 'kid-gs').name, 'Lou');
        assert.equal(s.loadSettings('kid-gs').firstName, 'Lou');
    });
    test('renameProfile_FirstNameEqualToOldName_FollowsTheRename', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        s.saveSettings('lou', { firstName: 'Lou' });
        p.renameProfile('lou', 'Louise');
        assert.equal(s.loadSettings('lou').firstName, 'Louise');
    });
    test('renameProfile_FirstNameDifferent_KeepsIt', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        s.saveSettings('lou', { firstName: 'Louna' });
        p.renameProfile('lou', 'Loulou');
        assert.equal(s.loadSettings('lou').firstName, 'Louna');
    });
});

describe('setFirstName', () => {
    test('setFirstName_ProfileStillPlaceholder_RenamesProfileToo', () => {
        s.saveProfiles([{ id: 'kid-gs', name: 'Enfant 1', avatar: '🦊', track: 'gs', placeholder: true }]);
        p.setFirstName('kid-gs', 'Zoé');
        assert.equal(s.loadSettings('kid-gs').firstName, 'Zoé');
        assert.equal(s.loadProfiles().find(x => x.id === 'kid-gs').name, 'Zoé');
    });
    test('setFirstName_SeededProfileAfterGamePrefill_RenamesProfileToo', () => {
        // gs.html prefills the first name from the seeded profile on first open; the parent corner edits it afterwards.
        p.prefillFirstName(p.ensureProfiles()[0]);
        p.setFirstName('kid-gs', 'Zoé');
        assert.equal(s.loadProfiles().find(x => x.id === 'kid-gs').name, 'Zoé');
    });
    test('setFirstName_ProfileNamedDifferently_KeepsProfileName', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        s.saveSettings('lou', { firstName: 'Louna' });
        p.setFirstName('lou', 'Louna-Rose');
        assert.equal(s.loadProfiles()[0].name, 'Lou');
    });
    test('setFirstName_NewName_LeavesTrackProgressToTheTrack', () => {
        // I9: profiles.js only renames; the GS track prunes its own name cards (assets/gs/name-cards.js).
        p.ensureProfiles();
        const card = { box: 2, due: '2026-10-18', seen: 1, lapses: 0 };
        s.saveSrs('kid-gs', 'gs', { cards: { 'name/lou#name-spell': card, 'letters/a#trace': card }, introduced: {} });
        p.setFirstName('kid-gs', 'Zoe');
        assert.deepEqual(Object.keys(s.loadSrs('kid-gs', 'gs').cards).sort(), ['letters/a#trace', 'name/lou#name-spell']);
    });
});

describe('displayName', () => {
    test('displayName_FirstNameSet_UsesIt', () => {
        assert.equal(p.displayName({ name: 'Lou' }, { firstName: 'Louna' }), 'Louna');
    });
    test('displayName_NoFirstName_UsesRealProfileName', () => {
        assert.equal(p.displayName({ name: 'Lou' }, { firstName: '' }), 'Lou');
    });
    test('displayName_PlaceholderProfile_ReturnsEmpty', () => {
        assert.equal(p.displayName({ name: 'Enfant 1', placeholder: true }, { firstName: '' }), '');
    });
});

describe('prefillFirstName', () => {
    test('prefillFirstName_EmptyFirstNameAndRealProfileName_CopiesIt', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        assert.equal(p.prefillFirstName(s.loadProfiles()[0]).firstName, 'Lou');
        assert.equal(s.loadSettings('lou').firstName, 'Lou');
    });
    test('prefillFirstName_PlaceholderProfile_LeavesItEmpty', () => {
        s.saveProfiles([{ id: 'kid-gs', name: 'Enfant 1', avatar: '🦊', track: 'gs', placeholder: true }]);
        assert.equal(p.prefillFirstName(s.loadProfiles()[0]).firstName, '');
    });
    test('prefillFirstName_SeededGsProfile_PrefillsApolline', () => {
        assert.equal(p.prefillFirstName(p.ensureProfiles()[0]).firstName, 'Apolline');
        assert.equal(s.loadSettings('kid-gs').firstName, 'Apolline');
    });
});

describe('trackProfileId', () => {
    const profiles = [{ id: 'default', track: 'en' }, { id: 'kid-gs', track: 'gs' }, { id: 'kid2', track: 'gs' }];
    test('trackProfileId_ActiveOnThatTrack_ReturnsActive', () => {
        assert.equal(p.trackProfileId(profiles, 'kid2', 'gs'), 'kid2');
    });
    test('trackProfileId_ActiveOnAnotherTrack_ReturnsFirstProfileOfTheTrack', () => {
        assert.equal(p.trackProfileId(profiles, 'default', 'gs'), 'kid-gs');
    });
    test('trackProfileId_ActiveMissing_ReturnsFirstProfileOfTheTrack', () => {
        assert.equal(p.trackProfileId(profiles, 'gone', 'gs'), 'kid-gs');
    });
    test('trackProfileId_NoProfileOnTheTrack_KeepsActive', () => {
        assert.equal(p.trackProfileId([{ id: 'default', track: 'en' }], 'default', 'gs'), 'default');
    });
    test('trackProfileId_EmptyStorageAfterEnsureProfiles_ReturnsSeededGsProfile', () => {
        assert.equal(p.trackProfileId(p.ensureProfiles(), s.getActiveProfileId(), 'gs'), 'kid-gs');
    });
});

