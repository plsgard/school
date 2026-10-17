// assets/gs/cues.js
// Fixed cues spoken by the page itself (app.js) and the parent corner (parent.js). Pure, no DOM: tools/cues.mjs
// imports it in Node to record one clip per key (app.js cannot be imported outside a browser).
// Each key has exactly one text; U+00A0 before ! ? : (French typography).

export const PAGE_CUES = {
    letsGo: { key: 'ui.lets-go', text: 'C\'est parti !' },
    comeBackTomorrow: { key: 'ui.come-back-tomorrow', text: 'Tu as déjà joué aujourd\'hui. À demain !' },
    done: { key: 'ui.done', text: 'Bravo ! Tu as fini pour aujourd\'hui.' },
    // Themed practice rounds (home theme buttons): spoken when a round starts, and on its done screen.
    practice: {
        sons: { key: 'ui.practice.sons', text: 'On joue avec les sons !' },
        lettres: { key: 'ui.practice.lettres', text: 'On joue avec les lettres !' },
        ecrire: { key: 'ui.practice.ecrire', text: 'On s\'entraîne à écrire !' },
        nombres: { key: 'ui.practice.nombres', text: 'On joue avec les nombres !' },
    },
    practiceDone: { key: 'ui.practice-done', text: 'Bravo ! On rejoue ?' },
    // Parent corner "🔊 Tester": exercises the selected audio source.
    test: { key: 'ui.test', text: 'Bonjour ! Quel mot commence comme lapin ?' },
};
