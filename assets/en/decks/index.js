// assets/en/decks/index.js
// English decks: one JSON per séquence (see tools/README.md, "Lesson → deck"). Each item becomes one card per skill;
// a new item enters with its first skill (listen-pick), its others unlock once that card reached box 2 (core/session.js).

export const DECK_FILES = ['my-school-bag'];

export const SKILLS = { vocab: ['listen-pick', 'say-it'] };

export async function loadDecks(fetchImpl = fetch, base = 'assets/en/decks') {
    return Promise.all(DECK_FILES.map(async n => (await fetchImpl(`${base}/${n}.json`)).json()));
}

export function expandCards(decks) {
    return decks.flatMap(deck => deck.items.flatMap(item => (SKILLS[deck.kind] ?? []).map(skill => ({
        id: `${deck.id}/${item.id}#${skill}`, deckId: deck.id, kind: deck.kind, skill, item, deck,
    }))));
}
