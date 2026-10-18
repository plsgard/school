// assets/en/parent.js
// Parent corner of the English track (long-press ⚙️): pronunciation precision, tries, mic mode, cards per session,
// voice, a mic test showing what the device really hears, Leitner boxes and the words to watch.
// DOM nodes only: every text goes through textContent.
import { saveSettings, loadSrs, loadSessions } from '../storage.js';
import { boxCounts } from '../core/scheduler.js';
import { enSettings, EN_PROFILE } from './rules.js';
import { listen, recognitionSupported } from './listen.js';

const NBSP = ' ';
const WEEK_MS = 7 * 864e5;
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/;

function h(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k === 'class') e.className = v;
        else if (k in e && typeof v !== 'string') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
    }
    e.append(...children.flat().filter(c => c != null && c !== false));
    return e;
}

const card = (title, ...body) => h('section', { class: 'card p-3' }, h('h3', {}, title), ...body);

function select(label, value, options, onChange) {
    const s = h('select', { class: 'form-select', onchange: (e) => onChange(e.target.value) },
        ...options.map(([v, text]) => h('option', { value: String(v), selected: String(v) === String(value) }, text)));
    return h('label', { class: 'form-label w-100 mb-2' }, label, s);
}

export function mountParent(root, { profileId, settings, cards, decks, device, speech, onBack }) {
    const save = (patch) => Object.assign(settings, saveSettings(profileId, patch));
    const o = enSettings(settings);
    const srs = loadSrs(profileId, 'en');
    const sessions = loadSessions(profileId, 'en');
    const now = Date.now();
    const week = sessions.filter(s => s.date && now - new Date(s.date).getTime() < WEEK_MS);
    const played = week.flatMap(s => s.items ?? []);
    const firstTry = played.filter(i => i.correctFirstTry).length;

    // Apple's novelty voices (Bahh, Zarvox…) are no model for a learner.
    const voices = device.listVoices().filter(v => !NOVELTY.test(v.name));
    const testOut = h('pre', { hidden: true });
    // Mic tests: the second speaks first, like a session (the voice, then 🎤), to show whether recognition still
    // hears after audio played (iOS WebKit bug 321436). Both print what the engine fired, for diagnosis.
    const micTest = (speakFirst) => async (e) => {
        const btn = e.currentTarget; // null after the await
        btn.disabled = true;
        testOut.hidden = false;
        if (speakFirst) { testOut.textContent = 'La voix parle, puis dites une phrase…'; await speech.speak({ text: 'Now say a sentence in English.' }); }
        testOut.textContent = 'Dites une phrase en anglais…';
        const r = await listen({ lang: 'en-GB' });
        const heard = r.alternatives.length
            ? r.alternatives.map((a, i) => `${i + 1}. «\u00a0${a.transcript}\u00a0» (confiance ${Number(a.confidence ?? 0).toFixed(2)})`).join('\n')
            : `Rien reçu (erreur\u00a0: ${r.error}).`;
        const timeline = (r.events ?? []).map(ev => `${ev.t}\u00a0ms ${ev.type}${ev.detail ? ` ${ev.detail}` : ''}`).join('\n');
        testOut.textContent = `${heard}\n\nÉvénements${NBSP}:\n${timeline || '(aucun)'}\n\n${navigator.userAgent}`;
        btn.disabled = false;
    };

    const byItem = new Map(cards.map(c => [c.id, c]));
    const watch = Object.entries(srs.cards).filter(([, s]) => s.lapses >= 2)
        .sort(([, a], [, b]) => b.lapses - a.lapses).slice(0, 15)
        .map(([id, s]) => { const c = byItem.get(id); return c ? `${c.item.en[0]} (${c.skill === 'say-it' ? 'dire' : 'écouter'}) · ${s.lapses}${NBSP}erreurs` : null; })
        .filter(Boolean);
    const counts = boxCounts(srs);

    root.replaceChildren(
        h('header', { class: 'en-top' }, h('h1', { class: 'h3 m-0' }, 'Coin des parents'),
            h('button', { type: 'button', class: 'en-small-btn', onclick: onBack }, '✔ Fermer')),
        card('Prononciation',
            select('Précision demandée', o.precision, [
                ['indulgent', 'Indulgente\u00a0: l’accent français passe (th → s, h muet), 60 % des mots d’une phrase'],
                ['normal', 'Normale\u00a0: les mots doivent être reconnus (orthographes proches acceptées), 80 %'],
                ['exigeant', 'Exigeante\u00a0: mots exacts, 100 %'],
            ], v => save({ precision: v })),
            select('Essais avant de passer au suivant', o.tries, [1, 2, 3, 4, 5].map(n => [n, String(n)]), v => save({ tries: Number(v) })),
            h('p', { class: 'en-note' }, 'Après le dernier essai, le modèle est rejoué et on continue\u00a0: la carte reviendra plus tôt. Il n’est jamais bloqué.'),
            select('Micro', o.mic, [
                ['auto', 'Reconnaissance vocale quand elle est disponible'],
                ['self', 'Sans reconnaissance\u00a0: il dit le mot, écoute le modèle et s’évalue (👍 / 👎)'],
            ], v => save({ mic: v })),
            h('p', { class: 'en-note' }, recognitionSupported()
                ? 'Reconnaissance vocale disponible dans ce navigateur.'
                : 'Pas de reconnaissance vocale ici (sur iPad\u00a0: ouvrir la page dans Safari, pas depuis l’écran d’accueil\u00a0; Dictée activée dans Réglages › Général › Clavier).'),
            recognitionSupported() ? h('div', { class: 'en-row justify-content-start' },
                h('button', { type: 'button', class: 'en-small-btn', onclick: micTest(false) }, '🎤 Tester le micro'),
                h('button', { type: 'button', class: 'en-small-btn', onclick: micTest(true) }, '🔊 puis 🎤 (comme en séance)')) : null,
            testOut),
        card('Séance',
            select('Cartes par séance', o.enItems, [6, 8, 10, 12, 15, 20].map(n => [n, `${n}${NBSP}cartes`]), v => save({ enItems: Number(v) })),
            select('Voix anglaise', o.enVoice, [['', 'Automatique (anglais britannique)'], ...voices.map(v => [v.name, `${v.name} (${v.lang})`])],
                v => { save({ enVoice: v }); device.setPreferred(v); }),
            h('button', { type: 'button', class: 'en-small-btn', onclick: () => speech.speak({ text: 'I need a pencil sharpener for my pencil.' }) }, '🔊 Tester la voix'),
            voices.length ? null : h('p', { class: 'en-note' }, 'Aucune voix anglaise sur cet appareil\u00a0: Réglages › Accessibilité › Contenu énoncé › Voix › Anglais.')),
        card('Progrès',
            h('p', { class: 'm-0' }, `Cette semaine${NBSP}: ${week.length}${NBSP}séance(s), ${played.length}${NBSP}cartes, ${firstTry}${NBSP}justes du premier coup.`),
            h('p', { class: 'en-note' }, `Boîtes de Leitner (révision tous les ${EN_PROFILE.intervals.join(' / ')}${NBSP}jours)${NBSP}: ${counts.join(' · ')}`),
            h('p', { class: 'en-note' }, `Leçons${NBSP}: ${decks.map(d => `${d.label} (${d.items.length}${NBSP}mots)`).join(', ')}`),
            h('h4', { class: 'h6 mt-2' }, 'À surveiller (2 erreurs ou plus)'),
            watch.length ? h('ul', { class: 'mb-0' }, ...watch.map(w => h('li', { lang: 'en' }, w))) : h('p', { class: 'en-note m-0' }, 'Rien pour l’instant.')),
    );
}
