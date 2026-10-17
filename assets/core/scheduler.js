// assets/core/scheduler.js
// Pure Leitner scheduler. Dates are ISO day strings (YYYY-MM-DD). Never mutates input.

export const GS_PROFILE = { intervals: [1, 2, 4, 7, 7], onWrong: [1, 1, 1, 2, 3] };

export function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function record(srs, cardId, correctFirstTry, today, profile = GS_PROFILE) {
    const prev = srs.cards[cardId] ?? { box: 1, due: today, seen: 0, lapses: 0 };
    const maxBox = profile.intervals.length;
    const box = correctFirstTry ? Math.min(prev.box + 1, maxBox) : profile.onWrong[prev.box - 1];
    const next = {
        box,
        due: addDays(today, profile.intervals[box - 1]),
        seen: prev.seen + 1,
        lapses: prev.lapses + (correctFirstTry ? 0 : 1),
    };
    return { ...srs, cards: { ...srs.cards, [cardId]: next } };
}

export function dueCards(srs, today) {
    return Object.entries(srs.cards)
        .filter(([, c]) => c.due <= today)
        .sort(([, a], [, b]) => a.box - b.box || a.due.localeCompare(b.due))
        .map(([id]) => id);
}

export function boxCounts(srs) {
    const counts = [0, 0, 0, 0, 0];
    for (const c of Object.values(srs.cards)) counts[c.box - 1]++;
    return counts;
}
