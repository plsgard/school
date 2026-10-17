// tests/speech.test.mjs
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, createClipSource, createDeviceSource, SILENT_SOURCE } from '../assets/core/speech.js';

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

describe('speak (timeouts)', () => {
    test('speak_SourceRearmsTheTimeout_WaitsForTheNewDeadline', async () => {
        const calls = [];
        const src = { name: 'clips', canPlay: () => true, stop() { calls.push('stop'); },
            play(cue, { onDone, rearm }) { calls.push('play'); setTimeout(() => rearm(200), 5); setTimeout(() => { calls.push('end'); onDone(); }, 60); } };
        const sp = createSpeech({ sources: [src, SILENT_SOURCE], timeoutMs: () => 20 });
        await sp.speak({ key: 'k', text: 'x' });
        assert.deepEqual(calls, ['play', 'end']);
    });
    test('speak_SourceWithNetworkAllowance_AddsItToTheFirstTimeout', async () => {
        const calls = [];
        const src = { name: 'clips', networkAllowanceMs: 100, canPlay: () => true, stop() { calls.push('stop'); },
            play(cue, { onDone }) { calls.push('play'); setTimeout(() => { calls.push('end'); onDone(); }, 60); } };
        const sp = createSpeech({ sources: [src, SILENT_SOURCE], timeoutMs: () => 20 });
        await sp.speak({ key: 'k', text: 'x' });
        assert.deepEqual(calls, ['play', 'end']);
    });
    test('speak_RearmAfterDone_IsIgnored', async () => {
        let late = null;
        const src = { name: 'clips', canPlay: () => true, stop() {}, play(cue, { onDone, rearm }) { late = rearm; onDone(); } };
        const sp = createSpeech({ sources: [src, SILENT_SOURCE], timeoutMs: () => 20 });
        await sp.speak({ key: 'k', text: 'x' });
        late(10); // must not throw nor keep a timer alive
    });
});

const fakeAudio = () => class {
    constructor() { this.plays = []; this.duration = NaN; this.currentTime = 0; }
    play() { this.plays.push(this.src); return Promise.resolve(); }
    pause() {}
};

describe('createClipSource', () => {
    test('createClipSource_MetadataLoaded_RearmsToClipDurationPlusOneSecond', () => {
        const prev = globalThis.Audio;
        globalThis.Audio = fakeAudio();
        try {
            const src = createClipSource({ baseUrl: 'b', manifest: new Set(['ui.done']) });
            const rearms = [];
            src.play({ key: 'ui.done', text: 'x' }, { onDone() {}, rearm: (ms) => rearms.push(ms) });
            assert.ok(src.networkAllowanceMs >= 2000);
            const a = src.element();
            a.duration = 2.5;
            a.onloadedmetadata();
            a.currentTime = 1;
            a.onplaying();
            assert.deepEqual(rearms, [3500, 2500]);
        } finally { globalThis.Audio = prev; }
    });
    test('createClipSource_Preload_FetchesOnlyKnownKeysOnce', async () => {
        const urls = [];
        const src = createClipSource({ baseUrl: 'assets/audio/gs', manifest: new Set(['ui.done', 'letter.a.name']), fetchImpl: async (u) => { urls.push(u); return {}; } });
        await src.preload([{ key: 'ui.done' }, { key: 'ui.done' }, { key: 'nope' }, { text: 'no key' }, null, { key: 'letter.a.name' }]);
        assert.deepEqual(urls, ['assets/audio/gs/ui/done.mp3', 'assets/audio/gs/letter/a/name.mp3']);
    });
    test('createClipSource_PreloadFetchFails_StillResolves', async () => {
        const src = createClipSource({ baseUrl: 'b', manifest: new Set(['ui.done']), fetchImpl: async () => { throw new Error('offline'); } });
        await src.preload([{ key: 'ui.done' }]);
    });

    test('createClipSource_unlockThenPlay_reusesTheElementUnlockedInTheGesture', async () => {
        const made = [];
        const prev = globalThis.Audio;
        globalThis.Audio = class { constructor() { this.plays = []; made.push(this); } play() { this.plays.push(this.src); return Promise.resolve(); } pause() {} };
        try {
            const src = createClipSource({ baseUrl: 'assets/audio/gs', manifest: new Set(['ui.done']) });
            src.unlock();
            assert.equal(made.length, 1);
            assert.match(made[0].plays[0], /^data:audio\/wav;base64,/);
            src.play({ key: 'ui.done', text: 'x' }, { onDone() {} });
            assert.equal(made.length, 1);
            assert.equal(made[0].plays[1], 'assets/audio/gs/ui/done.mp3');
        } finally { globalThis.Audio = prev; }
    });
});

describe('createDeviceSource', () => {
    function fakeSynth(voices) {
        const spoken = [];
        return { spoken, getVoices: () => voices, addEventListener() {}, cancel() {}, speak(u) { spoken.push(u); } };
    }
    const prevU = globalThis.SpeechSynthesisUtterance;
    before(() => { globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } }; });
    after(() => { globalThis.SpeechSynthesisUtterance = prevU; });
    test('createDeviceSource_WithTransform_SpeaksTransformedTextAndKeepsTheUtterance', () => {
        const synth = fakeSynth([{ name: 'Thomas', lang: 'fr-FR' }]);
        const dev = createDeviceSource({ synth, transform: (t) => t.toUpperCase() });
        dev.play({ text: 'fff' }, { onDone() {} });
        assert.equal(synth.spoken[0].text, 'FFF');
        assert.equal(dev.utterance, synth.spoken[0]); // iOS drops onend when the utterance is garbage collected
    });
    test('createDeviceSource_DefaultLang_KeepsOnlyFrenchVoices', () => {
        const synth = fakeSynth([{ name: 'Thomas', lang: 'fr-FR' }, { name: 'Daniel', lang: 'en-GB' }]);
        assert.deepEqual(createDeviceSource({ synth }).listVoices().map(v => v.name), ['Thomas']);
    });
    test('createDeviceSource_EnglishLang_KeepsOnlyEnglishVoices', () => {
        const synth = fakeSynth([{ name: 'Thomas', lang: 'fr-FR' }, { name: 'Daniel', lang: 'en-GB' }]);
        assert.deepEqual(createDeviceSource({ synth, lang: 'en', preferred: ['Daniel'] }).listVoices().map(v => v.name), ['Daniel']);
    });
});
