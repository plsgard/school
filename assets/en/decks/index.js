// assets/en/decks/index.js
// English decks: one JSON per lesson (see README "Lesson → deck"). Each item becomes one card per skill of its deck
// kind; a new item enters with its first skill, the others unlock once that card reached box 2 (core/session.js).
//   vocab:   listen-pick (hear → tap the meaning), say-it (picture/French → say it)
//   grammar: gap-pick (pick the missing form), say-it (French → say the sentence; items with a French cue only)
//   text:    line-repeat (hear a line → repeat it), line-next (see the previous line → recite the next one)

// Order = teaching order: the current lesson first, so its new items are introduced first.
export const DECK_FILES = ['halloween-poem', 'have', 'school-premises', 'actions-in-class', 'my-school-bag'];

// Lessons made from photos of the school notebook (README "Photos → lesson"): one file, several groups. A group
// is a deck (kind + items) and may be of two more kinds, practised in writing on a ladder (ladder.js):
//   spell: a word or short form (cue "mercredi" → "Wednesday")     write: a phrase or sentence
// The current lesson first.
export const LESSON_FILES = ['what-day-is-it'];

// One deck per group, id `<lesson>-<group>`, carrying its lesson's identity. A group's `strict` is its items' default.
export function flattenLesson(lesson) {
    const meta = { id: lesson.id, label: lesson.label, exam: lesson.exam ?? null, source: lesson.source ?? '' };
    return lesson.groups.map(g => ({
        id: `${lesson.id}-${g.id}`, kind: g.kind, label: g.label, consigne: g.consigne ?? '', lesson: meta,
        items: g.strict ? g.items.map(it => ({ ...it, strict: { ...g.strict, ...(it.strict ?? {}) } })) : g.items,
    }));
}

export async function loadDecks(fetchImpl = fetch, base = 'assets/en/decks') {
    const get = async (n) => (await fetchImpl(`${base}/${n}.json`)).json();
    const [lessons, decks] = await Promise.all([Promise.all(LESSON_FILES.map(get)), Promise.all(DECK_FILES.map(get))]);
    return [...lessons.flatMap(flattenLesson), ...decks];
}

export function skillsFor(deck, item) {
    switch (deck.kind) {
        case 'spell':
        case 'write': return ['write'];
        case 'vocab': return ['listen-pick', 'say-it'];
        case 'grammar': return item.fr ? ['gap-pick', 'say-it'] : ['gap-pick'];
        case 'text': {
            // A line repeated in the poem (the refrain) is practised once; reciting it in place still counts.
            const first = deck.items.findIndex(x => x.en[0] === item.en[0]) === deck.items.indexOf(item);
            return first ? ['line-repeat', 'line-next'] : ['line-next'];
        }
        default: return [];
    }
}

export function expandCards(decks) {
    return decks.flatMap(deck => deck.items.flatMap(item => skillsFor(deck, item).map(skill => ({
        id: `${deck.id}/${item.id}#${skill}`, deckId: deck.id, kind: deck.kind, skill, item, deck,
    }))));
}
