// assets/en/generators.js
// Pure: card → exercise. listen-pick: hear the English, tap the matching picture / French meaning (4 choices).
// say-it: see the picture and the French, say the English (scored by pronounce.js, or self-judged).
// gap-pick: read a sentence with a gap (and its French), pick the missing form. line-repeat: hear a poem line,
// repeat it. line-next: see the previous line (or the title), recite the next one from memory.
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
            type: 'say-it', cardId: card.id, sentence: card.kind === 'grammar',
            consigne: `Dis-le en anglais${NBSP}!`,
            say: model,
            img: item.img ?? '', fr: item.fr,
            expected: item.en,
            answer: { en: model, fr: item.fr, img: item.img ?? '' },
        };
    }
    if (card.skill === 'gap-pick') {
        // The chosen form, in full: the child picked "have got", the feedback must not read "I've got".
        const filled = item.gap.replace('___', item.answer);
        const spoken = item.en.find(e => e === filled.replace(' — ', ' ')) ?? model;
        return {
            type: 'gap-pick', cardId: card.id,
            consigne: 'Complète la phrase.',
            say: spoken, filled, fr: item.fr ?? '', gap: item.gap,
            choices: shuffle(item.options.map(text => ({ text, correct: text === item.answer })), rng),
            answer: { en: model, fr: item.fr ?? '', img: '' },
        };
    }
    if (card.skill === 'line-repeat' || card.skill === 'line-next') {
        const lines = card.deck.items;
        const prev = lines[lines.indexOf(item) - 1] ?? null;
        const repeat = card.skill === 'line-repeat';
        return {
            type: card.skill, cardId: card.id,
            consigne: repeat ? 'Écoute et répète.' : prev ? 'Récite le vers suivant.' : 'Récite le premier vers.',
            say: model, expected: item.en,
            shown: repeat ? model : null,
            prev: repeat ? null : prev?.en[0] ?? null,
            title: card.deck.label.split(' · ')[0],
            fr: item.fr ?? '',
            answer: { en: model, fr: item.fr ?? '', img: '' },
        };
    }
    throw new Error(`unknown skill ${card.skill}`);
}
