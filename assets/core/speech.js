// assets/core/speech.js
// Audio behind one interface. Sources: clips (pre-generated mp3), device (Web Speech), silent (adult reads).
// speak() always resolves: on playback end, on error, or on a timeout. A source may add a network allowance to the
// first deadline (networkAllowanceMs) and re-arm it once it knows the real duration (play's `rearm(ms)`).

export const SILENT_SOURCE = { name: 'silent', canPlay: () => true, play: (_cue, { onDone }) => onDone(), stop() {} };

export function createSpeech({ sources, order = ['clips', 'device', 'silent'], timeoutMs = (t) => Math.max(1500, t.length * 110) }) {
    const byName = new Map(sources.map(s => [s.name, s]));
    let selected = order.find(n => byName.has(n)) ?? sources[0].name;
    let current = null; // { source, done }

    function resolveSource(cue) {
        const start = order.indexOf(selected);
        const chain = [selected, ...order.slice(start < 0 ? 0 : start + 1)];
        for (const n of chain) { const s = byName.get(n); if (s && s.canPlay(cue)) return s; }
        return SILENT_SOURCE;
    }

    function stop() {
        if (!current) return;
        current.source.stop();
        const { done } = current; current = null; done();
    }

    function speak(cue) {
        stop();
        const source = resolveSource(cue);
        return new Promise(resolve => {
            let finished = false;
            let timer = null;
            const done = () => { if (finished) return; finished = true; clearTimeout(timer); if (current?.done === done) current = null; resolve(); };
            // On timeout, silence the source first so a late clip cannot play over the next cue.
            const arm = (ms) => { clearTimeout(timer); timer = setTimeout(() => { try { source.stop(); } catch { /* ignore */ } done(); }, ms); };
            const rearm = (ms) => { if (!finished) arm(ms); };
            arm(timeoutMs(cue.text ?? '') + (source.networkAllowanceMs ?? 0));
            current = { source, done };
            try { source.play(cue, { onDone: done, rearm }); } catch { done(); }
        });
    }

    return { speak, stop, setSource: (n) => { if (byName.has(n)) selected = n; }, getSource: () => selected };
}

const PREFERRED = ['Audrey', 'Aurélie', 'Thomas', 'Marie', 'Jacques', 'Google français', 'Microsoft Paul', 'Microsoft Julie', 'Amélie'];
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)/i;

export function rankVoice(v, preferredName = '', { names = PREFERRED, locale = 'fr-FR' } = {}) {
    let r = 0;
    if (preferredName && v.name === preferredName) return -100;
    if (NOVELTY.test(v.name)) r += 100;
    if (locale && v.lang.replace('_', '-') !== locale) r += 20;
    const i = names.findIndex(n => v.name.startsWith(n));
    r += i < 0 ? 15 : i;
    if (/premium|enhanced|amélior/i.test(v.name)) r -= 5;
    return r;
}

// lang: language prefix of the voices kept ('fr' keeps fr-FR, fr-CA…); locale: the preferred region; preferred: voice
// name prefixes, best first. transform(text): what the engine is given (the GS track spells stretched sounds so the
// voice does not read "fff" as letter names); the shown text never changes.
export function createDeviceSource({ synth = globalThis.speechSynthesis, preferredVoice = '', lang = 'fr', locale = lang === 'fr' ? 'fr-FR' : '',
    preferred = PREFERRED, transform = (t) => t } = {}) {
    let voices = [];
    const langRe = new RegExp(`^${lang}([-_]|$)`, 'i');
    const rank = (v) => rankVoice(v, preferredVoice, { names: preferred, locale });
    const load = () => { voices = (synth?.getVoices() ?? []).filter(v => langRe.test(v.lang)).sort((a, b) => rank(a) - rank(b)); };
    synth?.addEventListener?.('voiceschanged', load);
    load();
    const source = {
        utterance: null, // kept referenced while it speaks: iOS drops onend of a garbage-collected utterance
        name: 'device',
        listVoices() { load(); return voices.map(v => ({ name: v.name, lang: v.lang })); },
        setPreferred(name) { preferredVoice = name; load(); },
        canPlay() { load(); return !!synth && voices.length > 0; },
        play(cue, { onDone }) {
            synth.cancel();
            const u = new SpeechSynthesisUtterance(transform(cue.text ?? ''));
            u.voice = voices[0]; u.lang = voices[0].lang; u.rate = 0.85; u.pitch = 1;
            const end = () => { if (source.utterance === u) source.utterance = null; onDone(); };
            u.onend = end; u.onerror = end;
            source.utterance = u;
            synth.speak(u);
        },
        stop() { source.utterance = null; synth?.cancel(); },
    };
    return source;
}

// 8 samples of silence: played inside the first user gesture so iOS lets the same element play clips later.
const SILENT_WAV = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Before a clip's metadata arrives, the deadline gets this much extra time for the network (slow 3G on a tablet).
const CLIP_NETWORK_MS = 2500;

export function createClipSource({ baseUrl, manifest = new Set(), fetchImpl = globalThis.fetch } = {}) {
    // manifest: Set of clip keys that exist (loaded from assets/audio/gs/manifest.json in Task 13)
    let audio = null;
    const url = (key) => `${baseUrl}/${key.replaceAll('.', '/')}.mp3`;
    return {
        name: 'clips',
        networkAllowanceMs: CLIP_NETWORK_MS,
        element: () => audio,
        // Warm the HTTP cache for the clips a session will play, so the first play is not a network round trip.
        async preload(cues) {
            const keys = [...new Set((cues ?? []).map(c => c?.key).filter(k => k && manifest.has(k)))];
            await Promise.allSettled(keys.map(k => fetchImpl(url(k))));
        },
        // Call synchronously inside a user gesture (the "Jouer" tap).
        unlock() {
            audio ??= new Audio();
            audio.src = SILENT_WAV;
            try { audio.play()?.catch?.(() => {}); } catch { /* ignore */ }
        },
        canPlay(cue) { return !!cue.key && manifest.has(cue.key); },
        play(cue, { onDone, rearm = () => {} }) {
            audio ??= new Audio();
            const a = audio;
            // Once the duration is known, the deadline becomes "what is left of the clip + 1 s".
            const known = () => { if (Number.isFinite(a.duration) && a.duration > 0) rearm(Math.round((a.duration - (a.currentTime || 0)) * 1000) + 1000); };
            a.onended = onDone; a.onerror = onDone;
            a.onloadedmetadata = known; a.onplaying = known;
            a.src = url(cue.key);
            a.play().catch(onDone);
        },
        stop() { if (audio) { audio.pause(); audio.currentTime = 0; } },
    };
}
