// assets/en/answer.js
// Pure: checks a typed answer against the accepted ones. 'almost' earns one more try and names why (a capital,
// a comma, a letter): in a lesson about writing dates, those are the lesson.
const PUNCT = /[,.!?]/g;

export const tidy = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
// Punctuation dropped, then spaces tidied again ("Monday , May" and "Monday, May" are the same miss).
const noPunct = (s) => tidy(s.replace(PUNCT, ' '));
const glued = (s) => s.replace(/\s+([,.!?])/g, '$1');

export function strictFor(kind, item) {
    return { case: true, punct: kind === 'write', ...(item?.strict ?? {}) };
}

function distance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = row;
    }
    return prev[b.length];
}

const RANK = { right: 2, almost: 1, wrong: 0 };

function checkOne(model, typed, strict) {
    const m = tidy(model), t = tidy(typed);
    if (!t) return { outcome: 'wrong', reasons: [] };
    if (m === t) return { outcome: 'right', reasons: [] };
    const loose = (s) => noPunct(s).toLowerCase();
    if (loose(m) === loose(t)) {
        // Same letters: only capitals and/or punctuation differ (a space before a comma is not a mistake).
        const reasons = [];
        if (strict.case && noPunct(m) !== noPunct(t)) reasons.push('case');
        if (strict.punct && glued(m).toLowerCase() !== glued(t).toLowerCase()) reasons.push('punct');
        return reasons.length ? { outcome: 'almost', reasons } : { outcome: 'right', reasons: [] };
    }
    // strict.spelling: no near miss (a suffix lesson: "3nd" is the mistake itself, not a typo of "3rd").
    const max = loose(m).length <= 5 ? 1 : 2;
    if (!strict.spelling && distance(loose(m), loose(t)) <= max) return { outcome: 'almost', reasons: ['spelling'] };
    return { outcome: 'wrong', reasons: [] };
}

// confusables: the other answers of the lesson. Typing one of them is a wrong answer, never a near miss
// ("Tuesday" is two letters away from "Thursday").
export function checkAnswer(accepted, typed, strict, confusables = []) {
    let best = { outcome: 'wrong', reasons: [] };
    const loose = (s) => noPunct(tidy(s)).toLowerCase();
    if (confusables.some(c => loose(c) === loose(typed)) && !accepted.some(a => loose(a) === loose(typed))) return best;
    for (const model of accepted) {
        const r = checkOne(model, typed, strict);
        if (RANK[r.outcome] > RANK[best.outcome]) best = r;
        if (best.outcome === 'right') break;
    }
    return best;
}
