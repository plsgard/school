// tests/speech.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, SILENT_SOURCE } from '../assets/core/speech.js';

function fakeSource(name, { can = true, finishes = true } = {}) {
    const calls = [];
    return { name, calls, canPlay: () => can, stop() { calls.push('stop'); },
        play(cue, { onDone }) { calls.push(cue.text); if (finishes) setTimeout(onDone, 5); } };
}

describe('speak', () => {
    test('speak_WithSelectedSource_UsesItAndResolvesOnDone', async () => {
        const dev = fakeSource('device');
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE] });
        sp.setSource('device');
        await sp.speak({ text: 'bonjour' });
        assert.deepEqual(dev.calls, ['bonjour']);
    });
    test('speak_WhenSourceCannotPlay_FallsBackToNextInOrder', async () => {
        const clips = fakeSource('clips', { can: false });
        const dev = fakeSource('device');
        const sp = createSpeech({ sources: [clips, dev, SILENT_SOURCE] });
        sp.setSource('clips');
        await sp.speak({ key: 'ui.bravo', text: 'bravo' });
        assert.deepEqual(dev.calls, ['bravo']);
    });
    test('speak_SilentSource_ResolvesImmediatelyWithoutPlaying', async () => {
        const dev = fakeSource('device');
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE] });
        sp.setSource('silent');
        await sp.speak({ text: 'x' });
        assert.deepEqual(dev.calls, []);
    });
    test('speak_WhenOnDoneNeverFires_ResolvesOnTimeout', async () => {
        const dev = fakeSource('device', { finishes: false });
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE], timeoutMs: () => 20 });
        sp.setSource('device');
        const t0 = Date.now();
        await sp.speak({ text: 'long sentence' });
        assert.ok(Date.now() - t0 < 500);
    });
    test('speak_CalledTwice_StopsPreviousFirst', async () => {
        const dev = fakeSource('device', { finishes: false });
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE], timeoutMs: () => 10 });
        sp.setSource('device');
        const p1 = sp.speak({ text: 'a' });
        const p2 = sp.speak({ text: 'b' });
        await Promise.all([p1, p2]);
        // 'a' is stopped by the second speak(); 'b' never finishes, so its timeout stops it too.
        assert.deepEqual(dev.calls, ['a', 'stop', 'b', 'stop']);
    });
    test('speak_AfterTimeout_StopsTimedOutSourceBeforeNextCue', async () => {
        const a = fakeSource('clips', { finishes: false });
        const b = fakeSource('device');
        const sp = createSpeech({ sources: [a, b, SILENT_SOURCE], timeoutMs: () => 20 });
        sp.setSource('clips');
        await sp.speak({ key: 'k', text: 'a' });
        sp.setSource('device');
        await sp.speak({ text: 'b' });
        assert.deepEqual(a.calls, ['a', 'stop']);
        assert.deepEqual(b.calls, ['b']);
    });
});
