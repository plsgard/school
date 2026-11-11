// assets/en/lesson-report.js
// Pure: where the child stands on a lesson, for the parent corner and for the text a parent pastes into a Claude
// session ("Copier le bilan") so the next version of the lesson insists on what is still hard.
import { LEARN_KINDS, topLevel, levelOf, isKnown, isMastered } from './ladder.js';
import { resolveItem } from './today.js';

const NBSP = ' ';
const LEVELS = { 1: 'reconnaître', 2: 'compléter', 3: 'écrire', 4: 'dictée' };

// cards: all the track's cards; only the lesson's written items count. Stored ids that no longer exist are ignored.
export function lessonReport({ lesson, cards, learn, hasVoice = true, now = new Date() }) {
    const items = cards.filter(c => c.deck.lesson?.id === lesson.id && LEARN_KINDS.includes(c.kind));
    const byLevel = { new: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const watch = [];
    let known = 0, mastered = 0;
    for (const c of items) {
        const state = learn.cards[c.id];
        if (!state) { byLevel.new++; continue; }
        const level = levelOf(state, c.kind, topLevel(c.kind, hasVoice));
        byLevel[level]++;
        if (isKnown(state)) known++;
        if (isMastered(state)) mastered++;
        else if (state.last) watch.push({ model: resolveItem(c.item, now).en[0], typed: state.last, level });
    }
    watch.sort((a, b) => a.level - b.level);
    return { id: lesson.id, label: lesson.label, exam: lesson.exam ?? null, total: items.length, known, mastered, byLevel, watch };
}

export function reportText(report, today) {
    const lines = [
        `Bilan de la leçon « ${report.label} » (${today})`,
        report.exam ? `Contrôle${NBSP}: ${report.exam}` : null,
        `${report.total} éléments${NBSP}: ${report.known} écrits de mémoire, dont ${report.mastered} acquis (réussis deux jours différents).`,
        `Pas encore vus${NBSP}: ${report.byLevel.new} · ${[1, 2, 3, 4].map(l => `${LEVELS[l]}${NBSP}: ${report.byLevel[l]}`).join(' · ')}`,
        report.watch.length ? `À surveiller (ce qu’il a écrit en dernier)${NBSP}:` : 'Rien à surveiller pour l’instant.',
        ...report.watch.map(w => `- ${w.model} ← «${NBSP}${w.typed}${NBSP}» (niveau ${w.level}, ${LEVELS[w.level]})`),
    ];
    return lines.filter(l => l != null).join('\n');
}

export { LEVELS };
