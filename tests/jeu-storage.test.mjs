// tests/jeu-storage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

installFakeLocalStorage();
const { loadGame, saveGame } = await import('../assets/storage.js');

test('loadGame_NothingSaved_ReturnsNull', () => {
    assert.equal(loadGame('kid-ce2', 'ile'), null);
});
test('saveGame_ThenLoad_RoundTripsPerProfileAndGame', () => {
    saveGame('kid-ce2', 'ile', { crystals: 12 });
    assert.deepEqual(loadGame('kid-ce2', 'ile'), { crystals: 12 });
    assert.equal(loadGame('default', 'ile'), null);
    assert.equal(localStorage.getItem('school.v1.game.kid-ce2.ile'), '{"crystals":12}');
});
