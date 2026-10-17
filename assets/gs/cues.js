// assets/gs/cues.js
// Fixed cues spoken by the page itself (app.js) and the parent corner (parent.js). Pure, no DOM: tools/cues.mjs
// imports it in Node to record one clip per key (app.js cannot be imported outside a browser).
// Each key has exactly one text; U+00A0 before ! ? : (French typography).

export const PAGE_CUES = {
    letsGo: { key: 'ui.lets-go', text: 'C\'est parti !' },
    comeBackTomorrow: { key: 'ui.come-back-tomorrow', text: 'Tu as déjà joué aujourd\'hui. À demain !' },
    done: { key: 'ui.done', text: 'Bravo ! Tu as fini pour aujourd\'hui.' },
    // Parent corner "🔊 Tester": exercises the selected audio source.
    test: { key: 'ui.test', text: 'Bonjour ! Quel mot commence comme lapin ?' },
};
