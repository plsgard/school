// Versioned, namespaced localStorage layer for the school app.
//
// All keys live under `school.v1.*` so future schema changes can be migrated
// without colliding with anything else in the origin's storage.
//
// History is keyed by profileId + quizId from day one (default profileId =
// "default") so per-child profiles can ship later with no migration.

const NS = 'school.v1';
const HISTORY_LIMIT = 5;
const DEFAULT_PROFILE_ID = 'default';

// Legacy key → quizId map. Used by `migrateLegacyHistory` exactly once.
const LEGACY_HISTORY_KEYS = {
    multiplicationHistory: 'multiplication',
    additionHistory: 'addition',
};

function historyKey(profileId, quizId) {
    return `${NS}.history.${profileId}.${quizId}`;
}

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function getActiveProfileId() {
    return localStorage.getItem(`${NS}.activeProfileId`) ?? DEFAULT_PROFILE_ID;
}

export function loadHistory(quizId, profileId = getActiveProfileId()) {
    return readJSON(historyKey(profileId, quizId), []);
}

export function saveResult(quizId, entry, profileId = getActiveProfileId()) {
    const key = historyKey(profileId, quizId);
    const history = readJSON(key, []);
    history.unshift({ ...entry, date: entry.date ?? new Date().toLocaleString() });
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    writeJSON(key, history);
    return history;
}

// One-shot migration of pre-namespaced keys. Idempotent: legacy keys are
// removed once successfully copied; subsequent calls are no-ops.
export function migrateLegacyHistory() {
    for (const [legacyKey, quizId] of Object.entries(LEGACY_HISTORY_KEYS)) {
        const legacy = readJSON(legacyKey, null);
        if (!Array.isArray(legacy) || legacy.length === 0) continue;
        const targetKey = historyKey(DEFAULT_PROFILE_ID, quizId);
        // Only seed the new key if empty — never overwrite newer data.
        if (readJSON(targetKey, null) === null) {
            writeJSON(targetKey, legacy.slice(0, HISTORY_LIMIT));
        }
        localStorage.removeItem(legacyKey);
    }
}
