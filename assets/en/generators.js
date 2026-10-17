// assets/en/generators.js
// Pure: card → exercise. listen-pick: hear the English, tap the matching picture / French meaning (4 choices).
// say-it: see the picture and the French, say the English (scored by pronounce.js, or self-judged).
const NBSP = ' ';

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const choice = (item, correct) => ({ id: item.id, img: item.img ?? '', fr: item.fr, correct });

export function generate(card, { cards, rng = Math.random }) {
    const { item } = card;
    const model = item.en[0];
    if (card.skill === 'listen-pick') {
        // Distractors: other items of the same deck first, then any vocab item; never the same French meaning.
        const pool = [...new Map(cards.filter(c => c.kind === 'vocab' && c.item.id !== item.id && c.item.fr !== item.fr)
            .sort((a, b) => (a.deckId === card.deckId ? 0 : 1) - (b.deckId === card.deckId ? 0 : 1))
            .map(c => [c.item.id, c.item])).values()];
        const sameDeck = pool.filter(x => cards.some(c => c.item === x && c.deckId === card.deckId));
        const others = sameDeck.length >= 3 ? sameDeck : pool;
        const distractors = shuffle(others, rng).slice(0, 3);
        return {
            type: 'listen-pick', cardId: card.id,
            consigne: `Écoute et touche la bonne réponse.`,
            say: model,
            choices: shuffle([choice(item, true), ...distractors.map(d => choice(d, false))], rng),
            answer: { en: model, fr: item.fr, img: item.img ?? '' },
        };
    }
    if (card.skill === 'say-it') {
        return {
            type: 'say-it', cardId: card.id,
            consigne: `Dis-le en anglais${NBSP}!`,
            say: model,
            img: item.img ?? '', fr: item.fr,
            expected: item.en,
            answer: { en: model, fr: item.fr, img: item.img ?? '' },
        };
    }
    throw new Error(`unknown skill ${card.skill}`);
}
