// assets/gs/themes.js
// GS practice themes (spec 2026-10-18 §3). A card belongs to exactly one theme, decided by its skill; core never sees
// a theme, the page passes inTheme(id) to composePractice as its `include` predicate.
// Sons is 👂 (listening), not 🔊: 🔊 is the replay button, and the child must not confuse the two.

export const THEMES = [
    { id: 'sons', emoji: '👂', label: 'Sons', skills: ['syll-count', 'syll-match', 'syll-initial', 'rhyme', 'sound-pick', 'sound-final', 'blend'] },
    { id: 'lettres', emoji: '🔤', label: 'Lettres', skills: ['letter-3scripts', 'sound-letter', 'name-spell'] },
    // trace is Écrire whatever its kind: a digit trace card is kind 'numbers' but never plays in a Nombres round.
    { id: 'ecrire', emoji: '✏️', label: 'Écrire', skills: ['trace'] },
    { id: 'nombres', emoji: '🔢', label: 'Nombres', skills: ['count', 'compare', 'decompose', 'number-line', 'dice', 'before-after', 'add'] },
];

const BY_SKILL = new Map(THEMES.flatMap(t => t.skills.map(s => [s, t.id])));

export const themeOf = (card) => BY_SKILL.get(card.skill) ?? null;
export const inTheme = (id) => (card) => themeOf(card) === id;
