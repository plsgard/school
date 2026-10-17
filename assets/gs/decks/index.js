// assets/gs/decks/index.js
// Loads deck JSON and expands every item into (item, skill) cards. Pure except loadDecks.

export const DECK_FILES = ['letters', 'numbers', 'mots-p1'];

export async function loadDecks(fetchImpl = fetch, base = 'assets/gs/decks') {
    return Promise.all(DECK_FILES.map(async n => (await fetchImpl(`${base}/${n}.json`)).json()));
}

// A word only gets syll-match / rhyme when another item of the same deck really shares
// the first syllable / the rhyme, so the correct choice always shares it (spec §7).
const hasPartner = (deck, item, key) => (deck?.items ?? []).some(x => x.id !== item.id && key(x) === key(item));

function skillsFor(kind, item, deck) {
    switch (kind) {
        case 'letters': return [
            'letter-3scripts',
            item.sound ? 'sound-letter' : null,
            item.trace ? 'trace' : null,
            item.sound && item.continuant ? 'blend' : null,
        ].filter(Boolean);
        case 'words': return [
            'syll-count',
            hasPartner(deck, item, x => x.syll[0]) ? 'syll-match' : null,
            'sound-pick',
            hasPartner(deck, item, x => x.rhyme) ? 'rhyme' : null,
        ].filter(Boolean);
        case 'numbers': return [
            item.n >= 1 ? 'count' : null, // an empty collection to count is confusing
            'compare',
            item.n >= 2 ? 'decompose' : null,
            item.n >= 1 ? 'number-line' : null,
        ].filter(Boolean);
        case 'name': return ['name-spell']; // v1: tracing the whole first name is deferred (needs composite waypoints)
        default: return [];
    }
}

export function expandCards(decks, { firstName = '' } = {}) {
    const cards = [];
    for (const deck of decks) {
        for (const item of deck.items) {
            for (const skill of skillsFor(deck.kind, item, deck)) {
                cards.push({ id: `${deck.id}/${item.id}#${skill}`, deckId: deck.id, kind: deck.kind, skill, item, deck });
            }
        }
    }
    const name = firstName.trim();
    const id = (name.match(/\p{L}/gu) ?? []).join('').toLowerCase(); // hyphens, spaces, symbols are not tiles
    if (id) {
        const item = { id, text: name };
        const deck = { id: 'name', kind: 'name', label: 'Prénom', items: [item] };
        for (const skill of skillsFor('name', item, deck)) {
            cards.push({ id: `name/${item.id}#${skill}`, deckId: 'name', kind: 'name', skill, item, deck });
        }
    }
    return cards;
}
