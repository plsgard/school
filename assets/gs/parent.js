// assets/gs/parent.js
// Parent corner (adult-facing, behind a long-press on ⚙️): settings, audio source and voice, today's session cap,
// Leitner view, decks and the week's results. Built with DOM nodes only: names, voices and labels go through
// textContent, never innerHTML.
import { saveSettings, loadSrs, loadSessions } from '../storage.js';
import { boxCounts, GS_PROFILE } from '../core/scheduler.js';
import { cardLabel, extraSessionState } from './rules.js';
import { setFirstName } from '../profiles.js';

const NBSP = ' ';
const WEEK_MS = 7 * 864e5;

// h('div', { class: 'x', onclick: fn }, 'text', child, …) → element. Strings become text nodes.
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
const every = (n) => (n === 1 ? 'chaque jour' : n === 7 ? 'chaque semaine' : `tous les ${n}${NBSP}jours`);
const plural = (n, one, many) => `${n}${NBSP}${n > 1 ? many : one}`;

export function mountParent(root, { profileId, settings, cards, device, speech, today, parentModeOn, onBack }) {
    root.classList.add('gs-parent');
    const save = (patch) => Object.assign(settings, saveSettings(profileId, patch));
    const srs = loadSrs(profileId, 'gs');
    const sessions = loadSessions(profileId, 'gs');
    const now = Date.now();
    const week = sessions.filter(s => s.date && now - new Date(s.date).getTime() < WEEK_MS);
    const items = week.flatMap(s => s.items ?? []);
    const scored = items.filter(i => i.cardId); // the filler pattern game is not a card
    const firstTry = scored.length ? Math.round(100 * scored.filter(i => i.correctFirstTry).length / scored.length) : 0;
    const watch = Object.entries(srs.cards).filter(([, c]) => c.lapses >= 2)
        .sort(([, a], [, b]) => b.lapses - a.lapses).slice(0, 8);
    const due = Object.values(srs.cards).filter(c => c.due <= today).length;
    const decks = [...new Map(cards.map(c => [c.deckId, c.deck])).values()];

    // ---- Settings
    const firstName = h('input', { class: 'form-control', id: 'firstName', value: settings.firstName, autocomplete: 'off', maxLength: 30 });
    // One name per child: also renames a placeholder picker card and drops the old name card's progress.
    const commitFirstName = () => { if (firstName.value.trim() !== settings.firstName) Object.assign(settings, setFirstName(profileId, firstName.value)); };
    firstName.addEventListener('change', commitFirstName);
    const sessionItems = h('select', { class: 'form-select', id: 'sessionItems' },
        [5, 6, 7, 8].map(n => h('option', { value: String(n), selected: n === settings.sessionItems }, String(n))));
    sessionItems.addEventListener('change', () => save({ sessionItems: Number(sessionItems.value) }));
    const parentMode = h('input', { class: 'form-check-input', type: 'checkbox', id: 'parentMode', checked: parentModeOn() });
    parentMode.addEventListener('change', () => save({ parentMode: parentMode.checked }));

    const settingsCard = card('Réglages',
        h('label', { class: 'form-label w-100', for: 'firstName' }, 'Prénom de l\'enfant (pour le jeu « remets les lettres de ton prénom »)'),
        firstName,
        h('label', { class: 'form-label w-100 mt-2', for: 'sessionItems' }, 'Nombre de jeux par partie'),
        sessionItems,
        h('div', { class: 'form-check mt-2' }, parentMode,
            h('label', { class: 'form-check-label', for: 'parentMode' },
                'Mode accompagné\u00a0: un adulte est à côté. Une ligne d\'aide s\'affiche pour vous, la réponse n\'est jamais révélée et vous passez au jeu suivant.')));

    // ---- Audio
    const voiceSelect = h('select', { class: 'form-select', id: 'voice' });
    const noVoice = h('div', { class: 'alert alert-warning small mt-2 mb-0', hidden: true },
        `Aucune voix française sur cet appareil. Sans clips enregistrés, le mode accompagné est activé par défaut${NBSP}: lisez les consignes à l'enfant.`);
    const fillVoices = () => {
        const voices = device.listVoices();
        voiceSelect.replaceChildren(...(voices.length
            ? voices.map(v => h('option', { value: v.name, selected: v.name === settings.voice }, `${v.name} (${v.lang})`))
            : [h('option', { value: '' }, 'Aucune voix française')]));
        voiceSelect.disabled = !voices.length;
        noVoice.hidden = voices.length > 0;
        if (settings.parentMode == null) parentMode.checked = parentModeOn();
    };
    fillVoices();
    // Some browsers list their voices late: refresh while the corner is open.
    const synth = globalThis.speechSynthesis;
    synth?.addEventListener?.('voiceschanged', fillVoices);
    voiceSelect.addEventListener('change', () => { save({ voice: voiceSelect.value }); device.setPreferred(voiceSelect.value); });

    const sources = [['clips', 'Clips enregistrés'], ['device', 'Voix de l\'appareil'], ['silent', 'Aucune voix (un adulte lit)']];
    const radios = sources.map(([value, label]) => {
        const input = h('input', { class: 'form-check-input', type: 'radio', name: 'audio', id: `audio-${value}`, value, checked: settings.audio === value });
        input.addEventListener('change', () => {
            save({ audio: value });
            speech.setSource(value);
            document.body.classList.toggle('silent', value === 'silent');
            if (settings.parentMode == null) parentMode.checked = parentModeOn(); // auto mode depends on the source
        });
        return h('div', { class: 'form-check' }, input, h('label', { class: 'form-check-label', for: `audio-${value}` }, label));
    });
    const test = h('button', { type: 'button', class: 'btn btn-warning rounded-pill mt-2 align-self-start', id: 'testVoice' }, '🔊 Tester');
    test.addEventListener('click', () => speech.speak({ key: 'ui.test', text: `Bonjour${NBSP}! Quel mot commence comme lapin${NBSP}?` }));

    const audioCard = card('Source audio', ...radios,
        h('label', { class: 'form-label w-100 mt-2', for: 'voice' }, 'Voix de l\'appareil'),
        voiceSelect, test, noVoice,
        h('p', { class: 'small text-muted mt-2 mb-0' },
            'Voix robotique ? Sur iPad\u00a0: Réglages › Accessibilité › Contenu énoncé › Voix › Français, puis téléchargez une voix « améliorée ». Sur Mac\u00a0: Réglages Système › Accessibilité › Contenu énoncé › Voix du système.'));

    // ---- Today's session (R24: exactly one more completed session today)
    const capLine = h('p', { class: 'mb-2' });
    const grant = h('button', { type: 'button', class: 'btn btn-success rounded-pill align-self-start', id: 'extraSession' }, 'Autoriser une autre partie aujourd\'hui');
    const renderCap = () => {
        const state = extraSessionState(loadSessions(profileId, 'gs'), settings, today);
        capLine.textContent = {
            'not-played': 'La partie du jour n\'est pas encore jouée.',
            'can-grant': `La partie du jour est jouée. L'enfant retrouvera ▶${NBSP}Jouer demain.`,
            'granted': 'Une partie de plus est autorisée aujourd\'hui.',
            'used': `La partie supplémentaire est jouée. À demain${NBSP}!`,
        }[state];
        grant.hidden = state !== 'can-grant';
    };
    grant.addEventListener('click', () => { save({ extraSessionOn: today }); renderCap(); });
    renderCap();
    const capCard = card('Partie du jour', capLine, grant);

    // ---- Leitner boxes, decks, week
    const boxes = boxCounts(srs);
    const leitnerCard = card('Boîtes de Leitner',
        h('div', { class: 'gs-boxes' }, boxes.map((n, i) => h('div', {},
            h('b', {}, String(n)),
            h('small', { class: 'text-muted' }, `Boîte ${i + 1}`), h('br'),
            h('small', { class: 'text-muted' }, every(GS_PROFILE.intervals[i]))))),
        h('p', { class: 'mb-0 mt-2' }, `À revoir aujourd'hui${NBSP}: ${plural(due, 'carte', 'cartes')}.`));

    const decksCard = card('Decks', h('ul', { class: 'list-unstyled mb-0' }, decks.map(d => {
        const n = cards.filter(c => c.deckId === d.id).length;
        return h('li', {}, d.label ?? d.id, ' ', h('span', { class: 'badge text-bg-light' }, plural(d.items.length, 'élément', 'éléments')),
            ' ', h('span', { class: 'badge text-bg-light' }, plural(n, 'carte', 'cartes')));
    })));

    const weekCard = card('Cette semaine',
        h('p', { class: 'mb-2' }, `${plural(week.length, 'partie', 'parties')} · ${plural(items.length, 'jeu', 'jeux')} · ${firstTry}${NBSP}% du premier coup`),
        h('h3', { class: 'mt-2' }, 'À surveiller'),
        watch.length
            ? h('ul', { class: 'mb-0' }, watch.map(([id, c]) => h('li', {}, `${cardLabel(id, cards)} (${plural(c.lapses, 'erreur', 'erreurs')})`)))
            : h('p', { class: 'text-muted mb-0' }, 'Rien pour l\'instant.'));

    const back = h('button', { type: 'button', class: 'gs-icon', id: 'parentBack', 'aria-label': 'Retour' }, '‹');
    back.addEventListener('click', () => {
        synth?.removeEventListener?.('voiceschanged', fillVoices);
        commitFirstName(); // typed, not blurred
        onBack();
    });

    root.replaceChildren(
        h('header', { class: 'gs-top' }, back, h('h2', {}, 'Coin des parents'), h('span', { style: 'width:56px' })),
        settingsCard, audioCard, capCard, leitnerCard, decksCard, weekCard);
}
