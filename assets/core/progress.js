// assets/core/progress.js
// Pure: one played card → next SRS state. An item counts as introduced today only once one of its cards is
// actually answered; writing it at session start would spend the daily budget on items a child never saw
// (abandoned sessions), leaving them neither new, due nor padding for the rest of the day.
import { record, GS_PROFILE } from './scheduler.js';

const itemKey = (cardId) => cardId.split('#')[0];

export function recordResult(srs, cardId, correctFirstTry, today, profile = GS_PROFILE) {
    const wasNew = !srs.cards[cardId];
    const next = record(srs, cardId, correctFirstTry, today, profile);
    if (!wasNew) return next;
    const key = itemKey(cardId);
    const todays = srs.introduced?.[today] ?? [];
    if (todays.includes(key)) return next;
    return { ...next, introduced: { ...srs.introduced, [today]: [...todays, key] } };
}
