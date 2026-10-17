// assets/gs/decks/index.js
// Loads deck JSON and expands every item into (item, skill) cards. Pure except loadDecks.

export const DECK_FILES = ['letters', 'numbers', 'mots-p1', 'mots-gs'];

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
        case 'words': {
            const skills = [
                'syll-count',
                hasPartner(deck, item, x => x.syll[0]) ? 'syll-match' : null,
                'sound-pick',
                hasPartner(deck, item, x => x.rhyme) ? 'rhyme' : null,
            ].filter(Boolean);
            // P2: a new word enters with its first skill only (session.js), so the first skill rotates by deck index
            // (syll-count, sound-pick, then syll-match / rhyme when the word has them): early sessions stay varied.
            const firsts = ['syll-count', 'sound-pick', 'syll-match', 'rhyme'].filter(sk => skills.includes(sk));
            const index = Math.max(0, (deck?.items ?? []).indexOf(item));
            const first = firsts[index % firsts.length];
            // New skills go last: the first skill of existing words (and so their first card) stays as shipped.
            return [first, ...skills.filter(sk => sk !== first),
                item.final ? 'sound-final' : null, item.syll.length >= 2 ? 'syll-initial' : null].filter(Boolean);
        }
        case 'numbers': return [
            // an empty collection (0) is confusing for both counting and comparing
            item.n >= 1 ? 'count' : null,
            item.n >= 1 ? 'compare' : null,
            item.n >= 2 ? 'decompose' : null,
            item.n >= 1 ? 'number-line' : null,
            item.n >= 1 ? 'dice' : null,
            item.n >= 1 ? 'before-after' : null,
            item.n >= 2 && item.n <= 5 ? 'add' : null,
            item.trace ? 'trace' : null, // digits 0–9; 0 has only this card (and is introduced last)
        ].filter(Boolean);
        case 'name': return ['name-spell']; // v1: tracing the whole first name is deferred (needs composite waypoints)
        default: return [];
    }
}

// Item id of the first-name card: its letters only, lowercased (hyphens, spaces, symbols are not tiles).
export const nameItemId = (firstName) => (firstName.trim().match(/\p{L}/gu) ?? []).join('').toLowerCase();

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
    const id = nameItemId(name);
    if (id) {
        const item = { id, text: name };
        const deck = { id: 'name', kind: 'name', label: 'Prénom', items: [item] };
        for (const skill of skillsFor('name', item, deck)) {
            cards.push({ id: `name/${item.id}#${skill}`, deckId: 'name', kind: 'name', skill, item, deck });
        }
    }
    return cards;
}
