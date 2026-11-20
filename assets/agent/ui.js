// assets/agent/ui.js
// DOM overlays of Agent L: the HUD, the briefing, the debrief, the hideout, the parent corner and the intro. Data
// text always goes through textContent (el() never sets innerHTML). French UI text, English briefings for English
// lessons (spoken when a voice exists; a tap shows the French).
import { dayNumber } from './rules.js';

const NBSP = ' ';
const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
}

// One card at a time in #overlay; resolves with the value its buttons give.
export function openCard(build) {
    const overlay = $('overlay'), card = $('card');
    return new Promise(resolve => {
        const close = (value) => { overlay.hidden = true; card.replaceChildren(); resolve(value); };
        card.replaceChildren(...build(close).filter(Boolean));
        overlay.hidden = false;
        card.querySelector('button')?.focus({ preventScroll: true });
    });
}

export const typeName = (type) => (type === 'sort' ? 'Tri' : 'Infiltration');

// ---------------------------------------------------------------- HUD
export function createHud() {
    const set = (id, text, cls = null) => { const n = $(id); n.textContent = text; if (cls !== null) n.className = `ag-pill ${cls}`; };
    return {
        credits: (n) => set('credits', `💰 ${n}`),
        rank: (name) => set('rank', `🎖️ ${name}`),
        mission(on) {
            for (const id of ['lockCount', 'alarm']) $(id).hidden = !on;
            $('homeBtn').hidden = on;
            $('quitBtn').hidden = !on;
        },
        locks: (i, total, label = '🔒') => set('lockCount', `${label} ${i}${NBSP}/${NBSP}${total}`),
        alarm: (n) => set('alarm', n ? `🚨 ${'▮'.repeat(n)}${'▯'.repeat(3 - n)}` : '🚨 ▯▯▯', n ? `alarm${n > 1 ? ` alarm${n}` : ''}` : ''),
        gadget(text) { $('gadgetInfo').hidden = !text; $('gadgetInfo').textContent = text ?? ''; },
        sound: (on) => { $('soundBtn').textContent = on ? '🔊' : '🔇'; },
    };
}

// ---------------------------------------------------------------- briefing
const PLACES = [
    { en: 'the library', fr: 'la bibliothèque' }, { en: 'the canteen', fr: 'la cantine' },
    { en: 'the art room', fr: 'la salle d’arts plastiques' }, { en: 'the playground', fr: 'la cour' },
    { en: 'the music room', fr: 'la salle de musique' }, { en: 'the science lab', fr: 'le labo de sciences' },
    { en: 'the gym', fr: 'le gymnase' }, { en: 'the computer room', fr: 'la salle informatique' },
];

// Very simple English for the English lessons; French for the other subjects.
export function briefingLines(lesson, type, index = 0) {
    if (lesson.subject === 'en') {
        const p = PLACES[index % PLACES.length];
        return [
            { en: `Agent L, GLITCH has locked ${p.en}.`, fr: `Agent L, GLITCH a verrouillé ${p.fr}.` },
            { en: 'Open ten doors. Each door asks a question.', fr: 'Ouvre dix portes. Chaque porte pose une question.' },
            { en: 'Stay out of sight of the robots!', fr: `Ne te fais pas voir par les robots${NBSP}!` },
        ];
    }
    if (type === 'sort') {
        return [
            { fr: 'Agent L, GLITCH a mélangé toutes les caisses de l’entrepôt.' },
            { fr: 'Prends chaque caisse au distributeur 📦 et pose-la dans la bonne zone.' },
            { fr: `Attention aux drones${NBSP}: s’ils t’attrapent, la caisse retourne au distributeur.` },
        ];
    }
    return [
        { fr: 'Agent L, GLITCH a verrouillé le laboratoire.' },
        { fr: `Dix portes à ouvrir${NBSP}: chacune pose une question du cours.` },
        { fr: `Reste hors de vue des robots${NBSP}!` },
    ];
}

const daysUntil = (exam, today) => dayNumber(exam) - dayNumber(today);

// Resolves 'go' or 'later'.
export function showBriefing(lesson, type, { priority = false, training = false, exam = null, today = '', index = 0, say = null } = {}) {
    const lines = briefingLines(lesson, type, index);
    const english = lines.some(l => l.en);
    if (english && say) say(lines.map(l => l.en).join(' '));
    return openCard((close) => {
        const text = el('p', { class: 'ag-briefing', lang: english ? 'en' : 'fr' }, lines.map(l => l.en ?? l.fr).join(' '));
        const fr = el('p', { class: 'ag-briefing fr', hidden: true }, lines.map(l => l.fr).join(' '));
        if (english) {
            text.setAttribute('role', 'button');
            text.setAttribute('tabindex', '0');
            text.addEventListener('click', () => { fr.hidden = !fr.hidden; });
        }
        const days = exam && today ? daysUntil(exam, today) : null;
        return [
            el('p', { class: 'ag-kicker' }, `${typeName(type)} · ${lesson.label}`),
            el('h2', {}, '🕵️ Ordre de mission'),
            text,
            english ? el('p', { class: 'ag-note' }, '👆 Touche le texte pour le lire en français.') : null,
            fr,
            days != null && days >= 0 && days <= 7 ? el('p', {}, days === 0 ? `📅 Contrôle aujourd’hui${NBSP}!` : `📅 Contrôle dans ${days}${NBSP}jour${days > 1 ? 's' : ''}.`) : null,
            priority ? el('p', {}, `⭐ Mission prioritaire${NBSP}: crédits doublés à ta première mission finie aujourd’hui.`) : null,
            training ? el('p', { class: 'ag-note' }, `Rien de nouveau à réviser ici aujourd’hui${NBSP}: c’est un entraînement (rien n’est enregistré).`) : null,
            el('div', { class: 'ag-row' },
                el('button', { type: 'button', class: 'ag-cta secondary', onclick: () => close('later') }, 'Plus tard'),
                el('button', { type: 'button', class: 'ag-cta', onclick: () => close('go') }, '▶ C’est parti')),
        ];
    });
}

// ---------------------------------------------------------------- debrief
export function showDebrief({ stars = 0, credits = 0, rankUp = null, missed = [], training = false, quit = false, caught = 0 }) {
    return openCard((close) => [
        el('h2', {}, quit ? '🏠 Mission interrompue' : stars ? `Mission accomplie${NBSP}!` : 'Mission terminée'),
        quit ? el('p', { class: 'ag-note' }, 'Tes réponses sont gardées. Pas d’étoiles cette fois.') : el('div', { class: 'ag-stars', 'aria-label': `${stars} étoile${stars > 1 ? 's' : ''} sur 3` }, '⭐'.repeat(stars) + '☆'.repeat(3 - stars)),
        training ? el('p', { class: 'ag-note' }, `Entraînement${NBSP}: rien n’était à réviser aujourd’hui, rien n’est enregistré.`) : null,
        el('p', {}, `💰 +${credits} crédits${!quit && caught === 0 && stars > 0 ? ` (bonus discrétion${NBSP}!)` : ''}`),
        rankUp ? el('p', { class: 'ag-briefing' }, `🎖️ Nouveau grade${NBSP}: ${rankUp}${NBSP}! Va voir la planque.`) : null,
        missed.length ? el('h3', {}, 'À retravailler') : null,
        missed.length ? el('ul', { class: 'ag-list' }, ...missed.map(m => el('li', {}, el('span', {}, m.cue), el('span', { class: 'model' }, m.model)))) : null,
        el('button', { type: 'button', class: 'ag-cta', onclick: () => close() }, 'Retour sur l’île'),
    ]);
}

// ---------------------------------------------------------------- hideout
// shop: [{ item, owned, equipped, locked, rankName, affordable }]; credits(): the current credits. Resolves when he leaves.
export function showHideout({ rankName, nextName, progress, credits, shop, best, streak, chips, onBuy, onEquip }) {
    return openCard((close) => {
        const list = el('ul', { class: 'ag-list ag-shop' });
        const head = el('p', {});
        const render = (rows) => (head.textContent = `🎖️ ${rankName} · 💰 ${credits()} crédits${streak >= 2 ? ` · 🔥 ${streak}${NBSP}jours d’affilée` : ''}`, list.replaceChildren(...rows.map(r => el('li', { class: r.locked ? 'locked' : '' },
            el('span', {}, r.item.name),
            r.locked ? el('span', { class: 'ag-note' }, `🔒 ${r.rankName}`)
                : r.owned ? (r.item.kind === 'board' ? el('span', { class: 'ag-note' }, '✔ Actif sur l’île')
                    : el('button', { type: 'button', class: 'ag-small', disabled: r.equipped && r.item.kind === 'outfit', onclick: () => render(onEquip(r.item.id)) },
                        r.equipped ? (r.item.kind === 'gadget' ? 'Ranger' : 'Porté') : 'Équiper'))
                : el('button', { type: 'button', class: 'ag-small', disabled: !r.affordable, onclick: () => render(onBuy(r.item.id)) }, `💰 ${r.item.cost}`)))));
        render(shop);
        return [
            el('h2', {}, '🏠 La planque'),
            head,
            nextName ? el('div', {}, el('p', { class: 'ag-note' }, `Prochain grade${NBSP}: ${nextName}`), el('div', { class: 'ag-bar' }, el('i', { style: `width: ${Math.round(progress * 100)}%` }))) : el('p', { class: 'ag-note' }, 'Grade maximum atteint.'),
            el('h3', {}, 'Équipement'),
            el('p', { class: 'ag-note' }, 'Les crédits se gagnent en mission. Un gadget sert pendant les missions.'),
            list,
            el('h3', {}, 'Trophées'),
            el('ul', { class: 'ag-list' }, ...best.map(b => el('li', {}, el('span', {}, b.label), el('span', {}, b.stars ? '⭐'.repeat(b.stars) + '☆'.repeat(3 - b.stars) : '—')))),
            el('p', { class: 'ag-note' }, `💾 Puces de données trouvées${NBSP}: ${chips.found}${NBSP}/${NBSP}${chips.total}`),
            el('button', { type: 'button', class: 'ag-cta', onclick: () => close() }, 'Retour sur l’île'),
        ];
    });
}

// ---------------------------------------------------------------- parent corner
// lessons: [{ label, progress: { mastered, known, learning, new } }]; days: [[day, { missions, locks, firstTry }]].
export function showParent({ settings, today: todayCount, lessons, days, onSettings, onReset }) {
    return openCard((close) => {
        let max = settings.maxMissions;
        const maxOut = el('strong', {}, String(max));
        const setMax = (d) => { max = Math.min(12, Math.max(1, max + d)); maxOut.textContent = String(max); onSettings({ maxMissions: max }); };
        const sound = el('input', { type: 'checkbox', checked: settings.sound, onchange: () => onSettings({ sound: sound.checked }) });
        let armed = false;
        const reset = el('button', { type: 'button', class: 'ag-small', onclick: () => {
            if (!armed) { armed = true; reset.textContent = `Confirmer${NBSP}: tout effacer${NBSP}?`; return; }
            onReset();
            reset.textContent = 'Partie remise à zéro';
            reset.disabled = true;
        } }, 'Remettre la partie à zéro');
        return [
            el('h2', {}, '⚙️ Coin des parents'),
            el('div', { class: 'ag-parent' },
                el('label', {}, el('span', {}, 'Missions par jour'), el('span', { class: 'ag-row', style: 'flex: 0 0 auto; align-items: center' },
                    el('button', { type: 'button', class: 'ag-small', onclick: () => setMax(-1), 'aria-label': 'Moins' }, '−'), maxOut,
                    el('button', { type: 'button', class: 'ag-small', onclick: () => setMax(1), 'aria-label': 'Plus' }, '+'))),
                el('p', { class: 'ag-note' }, `Aujourd’hui${NBSP}: ${todayCount} mission${todayCount > 1 ? 's' : ''}. L’île et la planque restent ouvertes une fois la limite atteinte.`),
                el('label', {}, el('span', {}, 'Bruitages du jeu (la voix anglaise des leçons reste active)'), sound)),
            el('h3', {}, 'Progrès par leçon'),
            el('div', { class: 'ag-parent' }, el('table', {},
                el('thead', {}, el('tr', {}, el('th', {}, 'Leçon'), el('th', {}, 'Acquis'), el('th', {}, 'Su'), el('th', {}, 'En cours'), el('th', {}, 'Nouveaux'))),
                el('tbody', {}, ...lessons.map(l => el('tr', {}, el('td', {}, l.label),
                    ...['mastered', 'known', 'learning', 'new'].map(k => el('td', {}, String(l.progress[k])))))))),
            el('p', { class: 'ag-note' }, `Acquis${NBSP}: réussi de mémoire deux jours différents. Su${NBSP}: réussi de mémoire une fois. Les progrès sont partagés avec la page d’anglais.`),
            el('h3', {}, '7 derniers jours'),
            days.length ? el('ul', { class: 'ag-list' }, ...days.map(([d, v]) => el('li', {}, el('span', {}, d),
                el('span', {}, `${v.missions} mission${v.missions > 1 ? 's' : ''} · ${v.locks} serrures · ${v.firstTry} du premier coup`))))
                : el('p', { class: 'ag-note' }, 'Aucune mission ces 7 derniers jours.'),
            el('p', { class: 'ag-note' }, 'La remise à zéro efface crédits, grades et achats du jeu, jamais les progrès des leçons.'),
            reset,
            el('button', { type: 'button', class: 'ag-cta', onclick: () => close() }, '✔ Fermer'),
        ];
    });
}

// ---------------------------------------------------------------- intro (first launch)
const INTRO = [
    { title: '🤖 GLITCH', text: `Une intelligence artificielle, GLITCH, a pris le contrôle de l’île de Cobalt avec ses robots. Toi, Agent L, tu vas reprendre les bâtiments un par un.` },
    { title: '🔒 Les serrures', text: `Dans chaque mission, chaque porte pose une question de tes leçons. Pas de chrono${NBSP}: le jeu attend ta réponse. Si tu te trompes, la bonne réponse s’affiche, tu la recopies et la porte s’ouvre quand même. Les étoiles viennent des réponses justes du premier coup.` },
    { title: '🏠 La planque', text: `Les balises lumineuses devant les bâtiments lancent les missions (⭐ dorées${NBSP}: crédits doublés). Ta planque est au port, près du départ${NBSP}: dépense tes crédits en gadgets et en tenues. Les robots te renvoient en arrière s’ils te voient, sans rien te faire perdre.` },
];

export async function showIntro() {
    for (let i = 0; i < INTRO.length; i++) {
        await openCard((close) => [
            el('h2', {}, INTRO[i].title),
            el('p', {}, INTRO[i].text),
            el('p', { class: 'ag-dots', 'aria-hidden': 'true' }, INTRO.map((_, j) => (j === i ? '●' : '○')).join(' ')),
            el('button', { type: 'button', class: 'ag-cta', onclick: () => close() }, i < INTRO.length - 1 ? 'Suivant ▶' : '▶ À toi de jouer'),
        ]);
    }
}
