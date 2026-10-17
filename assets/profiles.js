// assets/profiles.js
// Landing page "Qui joue ?": one big card per child. Tapping a card makes it the active profile and opens its track.
//
// One name per child. The profile name (picker card) and settings.firstName (greeting, name-spell game) stay in
// sync while they agree: renaming either side updates the other when the other was empty, equal to the old
// name, or still a legacy placeholder ("Enfant 1", seeded before the real names). Once a parent sets them apart on purpose (a nickname on the
// card, the real first name in the game), each keeps its own value.
//
// The 6ème profile keeps the id 'default': the older child's math history (and the legacy keys migrated to it)
// already lives under school.v1.history.default.*.
import { loadProfiles, saveProfiles, setActiveProfileId, loadSettings, saveSettings } from './storage.js';
import { holdToActivate } from './hold.js';

// The two children's real first names, seeded as real names (no placeholder): gs.html prefills the GS first name from
// it (greeting, name-spell game), and a parent can still rename either card.
const DEFAULTS = [
    { id: 'kid-gs', name: 'Apolline', avatar: '🦊', track: 'gs' },
    { id: 'default', name: 'Louis', avatar: '🐼', track: 'en' },
];
// Placeholders seeded by earlier versions: a profile still carrying one takes its real default name.
const LEGACY_PLACEHOLDERS = { 'kid-gs': 'Enfant 1', default: 'Enfant 2' };
const TRACK_LABELS = { gs: 'Grande Section', en: '6e' };
const TARGET = { gs: 'gs.html' }; // other tracks: the math quizzes ("Autres jeux") until the 6ème track ships
const MAX_NAME = 30;

export function ensureProfiles() {
    const stored = loadProfiles();
    if (stored.length) {
        let changed = false;
        for (const p of stored) {
            const real = DEFAULTS.find(d => d.id === p.id);
            if (!real || !p.placeholder || p.name !== LEGACY_PLACEHOLDERS[p.id]) continue;
            p.name = real.name;
            delete p.placeholder;
            changed = true;
        }
        if (changed) saveProfiles(stored);
        return stored;
    }
    const seeded = DEFAULTS.map(p => ({ ...p }));
    saveProfiles(seeded);
    return seeded;
}

// Makes the profile active; returns the page to open, or null to stay on the landing page.
export function selectProfile(profiles, id) {
    const p = profiles.find(x => x.id === id);
    if (!p) return null;
    setActiveProfileId(p.id);
    return TARGET[p.track] ?? null;
}

// Profile a track page plays as: the active one when it belongs to that track, else the first profile of the
// track (a home-screen web app opened with empty storage, or after picking another child). Never redirects.
export function trackProfileId(profiles, activeId, track) {
    if (profiles.find(p => p.id === activeId)?.track === track) return activeId;
    return profiles.find(p => p.track === track)?.id ?? activeId;
}

// Greeting name: the first name if set, else a real (non-placeholder) profile name, else nothing.
export const displayName = (profile, settings) => settings.firstName || (profile?.placeholder ? '' : profile?.name ?? '');

// Picker side: rename the card; the first name follows when it was empty or equal to the old name.
export function renameProfile(id, name) {
    const profiles = loadProfiles();
    const p = profiles.find(x => x.id === id);
    const next = name.trim().slice(0, MAX_NAME);
    if (!p || !next) return profiles;
    const { firstName } = loadSettings(id);
    if (!firstName || firstName === p.name) setFirstName(id, next, { syncProfile: false });
    p.name = next;
    delete p.placeholder;
    saveProfiles(profiles);
    return profiles;
}

// Game side (parent corner): set the first name and rename the picker card when it was a placeholder or equal to
// the old first name. Track progress tied to the old name is the track's business (GS: assets/gs/name-cards.js).
export function setFirstName(id, name, { syncProfile = true } = {}) {
    const next = name.trim().slice(0, MAX_NAME);
    const old = loadSettings(id).firstName;
    const settings = saveSettings(id, { firstName: next });
    if (syncProfile && next) {
        const profiles = loadProfiles();
        const p = profiles.find(x => x.id === id);
        if (p && (p.placeholder || p.name === old)) { p.name = next; delete p.placeholder; saveProfiles(profiles); }
    }
    return settings;
}

// Profiles named before the first-name setting existed: copy the card name into the game once.
export function prefillFirstName(profile) {
    const settings = loadSettings(profile.id);
    if (settings.firstName || profile.placeholder || !profile.name) return settings;
    return saveSettings(profile.id, { firstName: profile.name });
}

export function mountProfiles(root, { otherGames, renameButton } = {}) {
    let profiles = ensureProfiles();

    const render = () => root.replaceChildren(...profiles.map(p => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'avatar';
        b.dataset.id = p.id;
        const face = document.createElement('span');
        face.className = 'face';
        face.setAttribute('aria-hidden', 'true');
        face.textContent = p.avatar;
        const name = document.createElement('b');
        name.textContent = p.name;
        const track = document.createElement('small');
        track.textContent = TRACK_LABELS[p.track] ?? '';
        b.append(face, name, track);
        return b;
    }));
    render();

    root.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-id]');
        if (!b) return;
        const target = selectProfile(profiles, b.dataset.id);
        if (target) { location.href = target; return; }
        if (otherGames) { otherGames.open = true; otherGames.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });

    // Parent-only (long-press, like ⚙️ in the games): rename each child. prompt() is fine for an adult.
    if (renameButton) holdToActivate(renameButton, () => {
        for (const p of profiles) {
            const next = prompt(`Prénom pour ${p.avatar} ${TRACK_LABELS[p.track] ?? ''}`.trim(), p.placeholder ? '' : p.name);
            if (next == null) break; // Annuler stops the round
            if (next.trim() && next.trim() !== p.name) renameProfile(p.id, next);
        }
        profiles = loadProfiles();
        render();
    });
}
