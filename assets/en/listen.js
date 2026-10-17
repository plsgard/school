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

// → { alternatives: [{ transcript, confidence }], error? }. Several final results (a pause mid-sentence) are joined.
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
        const timer = setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, maxMs);
        const hard = setTimeout(() => { try { rec.abort(); } catch { /* ignore */ } finish(); }, maxMs + 1500); // Safari may never fire onend
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
            resolve(said.length ? { alternatives: said } : { alternatives: [], error: error ?? 'no-speech' });
        };
        rec.onresult = (e) => {
            // Some iOS builds never flag isFinal although interimResults is off: use every result then.
            const all = Array.from(e.results);
            const finals = all.filter(r => r.isFinal !== false);
            results = (finals.length ? finals : all)
                .map(r => Array.from({ length: r.length }, (_, j) => ({ transcript: r[j].transcript, confidence: r[j].confidence })));
        };
        rec.onerror = (e) => { error = e.error || 'error'; };
        rec.onend = finish;
        try { rec.start(); } catch { error = 'start-failed'; finish(); }
    });
}
