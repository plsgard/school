// assets/gs/say.js
// Pure. Text handed to a TTS engine for a cue: tools/gen-audio.mjs (macOS `say`) and the device voice
// (createDeviceSource({ transform })) both speak sayInput(cue.text); the page still shows the cue's own text.
// TTS engines spell repeated consonants as letter names ("fff" → "effe effe effe") and expand "za"/"zi" as
// abbreviations (zone artisanale / industrielle). Measured on Thomas (tools/README.md): a consonant run followed by
// a schwa ("ffffffeu") or by the rest of its word ("ffffffusée") is spoken as one stretched sound, and a doubled
// vowel run stays one long vowel. These clips still need a human listening check (README: "Clips to re-record").
const STRETCH = 6;
const stretch = (unit, n) => unit + unit.toLowerCase().repeat(n - 1); // keeps a sentence-initial capital
function sayWord(word) {
    const m = /^((?:ch){3}|(\p{L})\2\2)(\p{L}*)$/iu.exec(word);
    if (m) {
        const unit = m[2] ?? m[1].slice(0, 2), rest = m[3];
        if (/^[aeiou]$/i.test(unit)) return stretch(unit, STRETCH) + rest; // "aaa" → one long vowel
        return stretch(unit, STRETCH) + (rest || 'eu'); // "fff" → "ffffffeu"; "fffusée" → "ffffffusée"
    }
    return /^z[ai]$/i.test(word) ? `${word}h` : word; // "za"/"zi" alone are read as abbreviations
}
export function sayInput(text) {
    return text.replace(/\p{L}+/gu, sayWord);
}
