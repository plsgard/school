// assets/gs/name-cards.js
// The name-spell card is keyed by the first name's letters (decks/index.js nameItemId). When the first name
// changes (parent corner, or a rename on the picker), the old name's card progress is dropped so the new name
// starts fresh. Called by parent.js after a first-name change and by app.js at load.
import { loadSrs, saveSrs } from '../storage.js';
import { nameItemId } from './decks/index.js';

export function pruneNameCards(profileId, firstName) {
    const keep = nameItemId(firstName ?? '');
    const srs = loadSrs(profileId, 'gs');
    const cards = Object.fromEntries(Object.entries(srs.cards).filter(([cid]) => !cid.startsWith('name/') || (keep && cid.startsWith(`name/${keep}#`))));
    if (Object.keys(cards).length !== Object.keys(srs.cards).length) saveSrs(profileId, 'gs', { ...srs, cards });
}
