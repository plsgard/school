// assets/gs/rules.js
// Pure rules shared by the page, the renderers and the parent corner: local day, daily cap, parent mode,
// human-readable card names and the one-line adult prompt of parent mode.

const NBSP = ' ';
const pad = (n) => String(n).padStart(2, '0');

// R7: local calendar day (France is UTC+1/+2; a UTC date would merge or skip days around midnight).
export const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const sessionsOn = (sessions, day) => sessions.filter(s => s.date && localDay(new Date(s.date)) === day).length;

// R4/R24: one completed session a day; a parent may allow exactly one more for today (settings.extraSessionOn = day).
export function dailyCapReached(sessions, settings, day) {
    const allowed = 1 + (settings.extraSessionOn === day ? 1 : 0);
    return sessionsOn(sessions, day) >= allowed;
}

// What the parent corner shows about today's cap: 'not-played' | 'can-grant' | 'granted' | 'used'.
export function extraSessionState(sessions, settings, day) {
    const n = sessionsOn(sessions, day);
    if (settings.extraSessionOn === day) return n >= 2 ? 'used' : 'granted';
    return n >= 1 ? 'can-grant' : 'not-played';
}

// Spec §9: with no French voice on the device, parent mode is on until a parent sets it explicitly.
export function effectiveParentMode(settings, hasFrenchVoice) {
    return typeof settings.parentMode === 'boolean' ? settings.parentMode : !hasFrenchVoice;
}

const SKILL_LABELS = {
    'syll-count': 'syllabes',
    'syll-match': 'même début',
    'sound-pick': 'premier son',
    'rhyme': 'rime',
    'sound-letter': 'son de la lettre',
    'letter-3scripts': 'trois écritures',
    'blend': 'coller les sons',
    'trace': 'tracer',
    'name-spell': 'épeler',
    'count': 'compter',
    'compare': 'comparer',
    'decompose': 'décomposer',
    'number-line': 'suite des nombres',
};

function itemName(card) {
    const it = card.item;
    switch (card.kind) {
        case 'letters': return `lettre ${it.id}`;
        case 'numbers': return `nombre ${it.n}`;
        case 'words': return it.text;
        case 'name': return `prénom ${it.text}`;
        default: return it.text ?? it.id;
    }
}

// "lapin · rime", "lettre a · tracer". A card no longer in the decks falls back to its raw item id.
export function cardLabel(cardId, cards) {
    const [path, skill] = cardId.split('#');
    const card = cards.find(c => c.id === cardId);
    const name = card ? itemName(card) : path.split('/').pop();
    return `${name} · ${SKILL_LABELS[skill] ?? skill}`;
}

// Parent mode (spec §4): one line for the adult on blend and trace exercises; null elsewhere. Never spoken.
export function adultHint(ex) {
    if (ex.type === 'blend' && ex.sounds) {
        const [c, v, syl] = ex.sounds;
        return `Faites-lui étirer le premier son, puis coller${NBSP}: ${c}… ${v}… ${syl}.`;
    }
    if (ex.type === 'trace') return 'Montrez le point vert, puis tracez la lettre une fois dans l\'air, ensemble.';
    return null;
}
