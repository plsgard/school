// assets/core/speech.js
// Audio behind one interface. Sources: clips (pre-generated mp3), device (Web Speech), silent (adult reads).
// speak() always resolves: on playback end, on error, or on a timeout.

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
            const done = () => { if (finished) return; finished = true; clearTimeout(timer); if (current?.done === done) current = null; resolve(); };
            const timer = setTimeout(done, timeoutMs(cue.text ?? ''));
            current = { source, done };
            try { source.play(cue, { onDone: done }); } catch { done(); }
        });
    }

    return { speak, stop, setSource: (n) => { if (byName.has(n)) selected = n; }, getSource: () => selected };
}

const PREFERRED = ['Audrey', 'Aurélie', 'Thomas', 'Marie', 'Jacques', 'Google français', 'Microsoft Paul', 'Microsoft Julie', 'Amélie'];
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)/i;

export function rankVoice(v, preferredName = '') {
    let r = 0;
    if (preferredName && v.name === preferredName) return -100;
    if (NOVELTY.test(v.name)) r += 100;
    if (v.lang.replace('_', '-') !== 'fr-FR') r += 20;
    const i = PREFERRED.findIndex(n => v.name.startsWith(n));
    r += i < 0 ? 15 : i;
    if (/premium|enhanced|amélior/i.test(v.name)) r -= 5;
    return r;
}

export function createDeviceSource({ synth = globalThis.speechSynthesis, preferredVoice = '' } = {}) {
    let voices = [];
    const load = () => { voices = (synth?.getVoices() ?? []).filter(v => /^fr([-_]|$)/i.test(v.lang)).sort((a, b) => rankVoice(a, preferredVoice) - rankVoice(b, preferredVoice)); };
    synth?.addEventListener?.('voiceschanged', load);
    load();
    return {
        name: 'device',
        listVoices() { load(); return voices.map(v => ({ name: v.name, lang: v.lang })); },
        setPreferred(name) { preferredVoice = name; load(); },
        canPlay() { load(); return !!synth && voices.length > 0; },
        play(cue, { onDone }) {
            synth.cancel();
            const u = new SpeechSynthesisUtterance(cue.text);
            u.voice = voices[0]; u.lang = voices[0].lang; u.rate = 0.85; u.pitch = 1;
            u.onend = onDone; u.onerror = onDone;
            synth.speak(u);
        },
        stop() { synth?.cancel(); },
    };
}

export function createClipSource({ baseUrl, manifest = new Set() } = {}) {
    // manifest: Set of clip keys that exist (loaded from assets/audio/gs/manifest.json in Task 13)
    let audio = null;
    return {
        name: 'clips',
        canPlay(cue) { return !!cue.key && manifest.has(cue.key); },
        play(cue, { onDone }) {
            audio ??= new Audio();
            audio.onended = onDone; audio.onerror = onDone;
            audio.src = `${baseUrl}/${cue.key.replaceAll('.', '/')}.mp3`;
            audio.play().catch(onDone);
        },
        stop() { if (audio) { audio.pause(); audio.currentTime = 0; } },
    };
}
