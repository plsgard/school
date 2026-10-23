// assets/ce2/parent.js
// Parent corner of the CE2 track (long-press ⚙️): the level (set by hand, unlock « zéro en haut » and 4 chiffres),
// what the recent sessions show per level, the session settings and a reset. DOM nodes only, every text via textContent.
import { saveSettings, loadSettings, loadSrs, saveSrs, loadSessions } from '../storage.js';
import { LEVELS, LOCKABLE } from './generators.js';
import { ce2Settings, ladderOf, setLevel, isUnlocked, MASTERY } from './rules.js';

const NBSP = ' ';
const TRACK = 'ce2';

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

function check(label, checked, onChange) {
    return h('label', { class: 'form-check mb-1' },
        h('input', { type: 'checkbox', class: 'form-check-input', checked, onchange: (e) => onChange(e.target.checked) }),
        h('span', { class: 'form-check-label' }, label));
}

export function mountParent(root, { profileId, onBack }) {
    const render = () => {
        const o = ce2Settings(loadSettings(profileId));
        const srs = loadSrs(profileId, TRACK);
        const ladder = ladderOf(srs, o.unlocked);
        const save = (patch) => { saveSettings(profileId, patch); render(); };
        const played = loadSessions(profileId, TRACK).flatMap(s => s.items ?? []);
        const rows = LEVELS.map(l => {
            const at = played.filter(x => x.level === l.id);
            return { l, n: at.length, clean: at.filter(x => x.outcome === 'clean').length, missed: at.filter(x => x.outcome === 'missed').length };
        }).filter(r => r.n);

        root.replaceChildren(
            h('header', { class: 'ce2-top' }, h('h1', { class: 'h3 m-0' }, 'Coin des parents'),
                h('button', { type: 'button', class: 'ce2-small-btn', onclick: onBack }, '✔ Fermer')),
            card('Niveau',
                h('p', { class: 'mb-2' }, `Méthode${NBSP}: par compensation (+10 en haut, +1 en bas), celle de la classe.`),
                select('Niveau actuel', ladder.level, LEVELS.filter(l => isUnlocked(l.id, o.unlocked)).map(l => [l.id, `${l.id}. ${l.label} (${l.example})`]),
                    v => { saveSrs(profileId, TRACK, setLevel(srs, Number(v))); render(); }),
                h('p', { class: 'ce2-note mb-2' }, `Série en cours${NBSP}: ${ladder.streak}/${MASTERY} réussites du premier coup. Deux erreurs de suite font redescendre d’un niveau.`),
                ...LOCKABLE.map(id => {
                    const l = LEVELS.find(x => x.id === id);
                    return check(`Débloquer le niveau ${id}${NBSP}: ${l.label} (${l.example})`, o.unlocked.includes(id),
                        on => save({ ce2Unlocked: on ? [...o.unlocked, id] : o.unlocked.filter(x => x !== id) }));
                }),
                h('p', { class: 'ce2-note' }, 'Débloquez le zéro en haut quand la classe l’a vu, puis les 4 chiffres (prévu dans l’année de CE2).')),
            card('Séance',
                select('Mode proposé', o.mode, [['guided', 'Guidé (chaque colonne vérifiée tout de suite)'], ['solo', 'Tout seul (vérification à la fin)']], v => save({ ce2Mode: v })),
                select('Soustractions par séance', o.items, [6, 7, 8, 9, 10].map(n => [n, String(n)]), v => save({ ce2Items: Number(v) })),
                check(`Proposer «${NBSP}Vérifie avec une addition${NBSP}» après une bonne réponse`, o.proof, on => save({ ce2Proof: on }))),
            card('Progrès (14 dernières séances)',
                rows.length ? h('table', {},
                    h('thead', {}, h('tr', {}, h('th', {}, 'Niveau'), h('th', {}, 'Faites'), h('th', {}, 'Du premier coup'), h('th', {}, 'Solution montrée'))),
                    h('tbody', {}, ...rows.map(r => h('tr', {}, h('td', {}, `${r.l.id}. ${r.l.label}`), h('td', {}, String(r.n)), h('td', {}, String(r.clean)), h('td', {}, String(r.missed))))))
                    : h('p', { class: 'ce2-note m-0' }, 'Pas encore de séance.')),
            card('Remise à zéro',
                h('button', { type: 'button', class: 'ce2-small-btn', onclick: () => {
                    if (!confirm(`Effacer la progression des soustractions (niveau et révisions)${NBSP}?`)) return;
                    saveSrs(profileId, TRACK, { cards: {}, introduced: {} });
                    render();
                } }, '↺ Repartir du niveau 1')),
        );
    };
    render();
}
