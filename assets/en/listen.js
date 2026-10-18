// assets/en/listen.js
// One-shot speech recognition (Web Speech API). Safari iOS ≥ 14.5 has it in a Safari tab only: never in a web app
// added to the Home Screen (WebKit bug 225298), and it needs Dictation enabled. listen() always resolves.

const Ctor = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;
export const recognitionSupported = () => !!Ctor();

// Errors that mean "the mic will not work here" (switch to self-judging), as opposed to "say it again".
export const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'unsupported', 'language-not-supported']);

let current = null;

export function abortListening() {
    try { current?.abort(); } catch { /* ignore */ }
    current = null;
}

// → { alternatives: [{ transcript, confidence }], error?, events }. Several final results (a pause mid-sentence) are
// joined. events: what the engine fired, with ms since start() (the parent corner's mic test shows them): on iOS 26/27
// a recogniser started after the page played audio can stay silent without any event (WebKit bug 321436).
export function listen({ lang = 'en-GB', maxMs = 8000 } = {}) {
    const C = Ctor();
    if (!C) return Promise.resolve({ alternatives: [], error: 'unsupported' });
    abortListening();
    return new Promise(resolve => {
        const rec = new C();
        current = rec;
        rec.lang = lang;
        rec.interimResults = false;
        rec.continuous = false;
        rec.maxAlternatives = 5;
        let results = [];
        let error = null;
        let settled = false;
        const t0 = Date.now();
        const events = [];
        const note = (type, detail = '') => events.push({ t: Date.now() - t0, type, detail });
        const timer = setTimeout(() => { note('stop-after-max'); try { rec.stop(); } catch { /* ignore */ } }, maxMs);
        const hard = setTimeout(() => { note('hard-timeout'); try { rec.abort(); } catch { /* ignore */ } finish(); }, maxMs + 1500); // Safari may never fire onend
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer); clearTimeout(hard);
            if (current === rec) current = null;
            const width = Math.max(0, ...results.map(r => r.length));
            const alternatives = [];
            for (let j = 0; j < width; j++) {
                const parts = results.map(r => r[Math.min(j, r.length - 1)]);
                alternatives.push({ transcript: parts.map(p => p.transcript.trim()).join(' '), confidence: Math.min(...parts.map(p => p.confidence ?? 0)) });
            }
            const said = alternatives.filter(a => a.transcript.trim()); // an empty transcript is silence, not a try
            resolve(said.length ? { alternatives: said, events } : { alternatives: [], error: error ?? 'no-speech', events });
        };
        for (const type of ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'nomatch']) {
            rec.addEventListener?.(type, () => note(type));
        }
        rec.onresult = (e) => {
            note('result', Array.from(e.results).map(r => `${r.isFinal ? 'final' : 'interim'} «${r[0]?.transcript ?? ''}»`).join(' + '));
            // Some iOS builds never flag isFinal although interimResults is off: use every result then.
            const all = Array.from(e.results);
            const finals = all.filter(r => r.isFinal !== false);
            results = (finals.length ? finals : all)
                .map(r => Array.from({ length: r.length }, (_, j) => ({ transcript: r[j].transcript, confidence: r[j].confidence })));
        };
        rec.onerror = (e) => { error = e.error || 'error'; note('error', error); };
        rec.onend = () => { note('end'); finish(); };
        try { rec.start(); } catch { error = 'start-failed'; finish(); }
    });
}
