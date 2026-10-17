// tests/name-cards.test.mjs
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

const ls = installFakeLocalStorage();
const s = await import('../assets/storage.js');
const { pruneNameCards } = await import('../assets/gs/name-cards.js');

beforeEach(() => ls.clear());
const card = { box: 2, due: '2026-10-18', seen: 1, lapses: 0 };

describe('pruneNameCards', () => {
    test('pruneNameCards_NewName_DropsSrsOfOtherNameCardsOnly', () => {
        s.saveSrs('kid-gs', 'gs', { cards: { 'name/lou#name-spell': card, 'name/zoe#name-spell': card, 'letters/a#trace': card }, introduced: {} });
        pruneNameCards('kid-gs', 'Zoe');
        assert.deepEqual(Object.keys(s.loadSrs('kid-gs', 'gs').cards).sort(), ['letters/a#trace', 'name/zoe#name-spell']);
    });
    test('pruneNameCards_EmptyName_DropsEveryNameCard', () => {
        s.saveSrs('kid-gs', 'gs', { cards: { 'name/lou#name-spell': card, 'letters/a#trace': card }, introduced: {} });
        pruneNameCards('kid-gs', '');
        assert.deepEqual(Object.keys(s.loadSrs('kid-gs', 'gs').cards), ['letters/a#trace']);
    });
    test('pruneNameCards_NothingToDrop_DoesNotWrite', () => {
        pruneNameCards('kid-gs', 'Lou');
        assert.equal(localStorage.getItem('school.v1.srs.kid-gs.gs'), null);
    });
});
