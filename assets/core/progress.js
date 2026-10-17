// assets/core/progress.js
// Pure: one played card → next SRS state. An item counts as introduced today only once one of its cards is
// actually answered; writing it at session start would spend the daily budget on items a child never saw
// (abandoned sessions), leaving them neither new, due nor padding for the rest of the day.
import { record, GS_PROFILE } from './scheduler.js';

const itemKey = (cardId) => cardId.split('#')[0];

export function recordResult(srs, cardId, correctFirstTry, today, profile = GS_PROFILE) {
    const key = itemKey(cardId);
    // Only a brand-new item counts: an unlocked sibling skill of a known item never charges the budget (R26).
    const wasNew = !Object.keys(srs.cards).some(id => itemKey(id) === key);
    const next = record(srs, cardId, correctFirstTry, today, profile);
    if (!wasNew) return next;
    const todays = srs.introduced?.[today] ?? [];
    if (todays.includes(key)) return next;
    return { ...next, introduced: { ...srs.introduced, [today]: [...todays, key] } };
}

// Practice rounds (spec 2026-10-18 §5): a new or due card records as in the daily session; a card that is not due
// yet earns a star when right (no promotion: the schedule decides when it comes back) and is demoted when wrong.
export function recordPractice(srs, cardId, correctFirstTry, today, profile = GS_PROFILE) {
    const prev = srs.cards[cardId];
    if (!prev || prev.due <= today) return recordResult(srs, cardId, correctFirstTry, today, profile);
    if (correctFirstTry) return srs;
    return record(srs, cardId, false, today, profile);
}
