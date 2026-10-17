// tests/smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

installFakeLocalStorage();
const storage = await import('../assets/storage.js');

test('getActiveProfileId_WhenNothingStored_ReturnsDefault', () => {
    assert.equal(storage.getActiveProfileId(), 'default');
});
