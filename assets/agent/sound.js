// assets/agent/sound.js
// A small synth for the game's sound effects (no audio files) and the English voice of the briefings and lock panels,
// through core/speech.js (device en-GB voice, else silent: nothing ever waits on speech it cannot play). The 🔊 toggle
// mutes the effects only: the lesson voice (dictation, listening) follows en.html, which plays whenever a voice exists.
// voiceName: the parent's English voice (settings enVoice, shared with en.html).
import { createSpeech, createDeviceSource, SILENT_SOURCE } from '../core/speech.js';

const NOTES = {
    door: [[520, 0.08, 'triangle'], [780, 0.12, 'triangle', 0.08]],
    right: [[660, 0.08, 'sine'], [990, 0.14, 'sine', 0.08]],
    coin: [[1320, 0.06, 'square', 0, 0.03], [1760, 0.1, 'square', 0.06, 0.03]],
    wrong: [[260, 0.18, 'sawtooth', 0, 0.04]],
    alarm: [[880, 0.18, 'square', 0, 0.05], [660, 0.18, 'square', 0.2, 0.05], [880, 0.18, 'square', 0.4, 0.05]],
    stun: [[1200, 0.25, 'sawtooth', 0, 0.05, -900]],
    caught: [[400, 0.3, 'triangle', 0, 0.08, -250]],
    pick: [[440, 0.06, 'triangle']],
    rank: [[523, 0.1, 'triangle'], [659, 0.1, 'triangle', 0.1], [784, 0.1, 'triangle', 0.2], [1046, 0.25, 'triangle', 0.3]],
};

export function createSound({ enabled = true, voiceName = '' } = {}) {
    let ctx = null;
    let on = enabled;
    const device = createDeviceSource({ lang: 'en', locale: 'en-GB', preferredVoice: voiceName,
        preferred: ['Daniel', 'Serena', 'Kate', 'Oliver', 'Arthur', 'Martha', 'Stephanie', 'Jamie', 'Google UK English'] });
    const speech = createSpeech({ sources: [device, SILENT_SOURCE], order: ['device', 'silent'] });

    function tone(freq, dur, type = 'sine', delay = 0, vol = 0.06, slide = 0) {
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    return {
        // Inside the ▶ Jouer tap: iOS lets audio and speech play only after a gesture started them.
        unlock() {
            try {
                ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
                if (ctx.state === 'suspended') ctx.resume();
            } catch { ctx = null; }
            try { globalThis.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* no speech */ }
        },
        play(name) {
            if (!on || !ctx) return;
            try { for (const [f, d, type, delay = 0, vol, slide] of NOTES[name] ?? []) tone(f, d, type, delay, vol, slide); } catch { /* ignore */ }
        },
        // English only; resolves at once when no English voice exists.
        say(text) { return text ? speech.speak({ text }) : Promise.resolve(); },
        stop() { speech.stop(); },
        // Same rule as en.html: dictation and listening locks exist when the device has an English voice.
        hasVoice: () => device.listVoices().length > 0,
        setEnabled(v) { on = !!v; },
        get enabled() { return on; },
    };
}
