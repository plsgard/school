// assets/profiles.js
// Landing page "Qui joue ?": one big card per child. Tapping a card makes it the active profile and opens its
// track. Names go through textContent; the parent renames a child with "Modifier les prénoms".
import { loadProfiles, saveProfiles, setActiveProfileId } from './storage.js';

const DEFAULTS = [
    { id: 'kid-gs', name: 'Enfant 1', avatar: '🦊', track: 'gs' },
    { id: 'kid-6e', name: 'Enfant 2', avatar: '🐼', track: 'en' },
];
const TRACK_LABELS = { gs: 'Grande Section', en: '6ème' };
const TARGET = { gs: 'gs.html' }; // other tracks: the math quizzes ("Autres jeux") until the 6ème track ships

export function mountProfiles(root, { otherGames, renameButton } = {}) {
    let profiles = loadProfiles();
    if (profiles.length === 0) { profiles = DEFAULTS.map(p => ({ ...p })); saveProfiles(profiles); }

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
        const p = profiles.find(x => x.id === b.dataset.id);
        if (!p) return;
        setActiveProfileId(p.id);
        const target = TARGET[p.track];
        if (target) { location.href = target; return; }
        if (otherGames) { otherGames.open = true; otherGames.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });

    // Parent-only: rename each child (prompt() is fine for an adult; children never type).
    renameButton?.addEventListener('click', () => {
        let changed = false;
        for (const p of profiles) {
            const next = prompt(`Prénom pour ${p.avatar} ${TRACK_LABELS[p.track] ?? ''}`.trim(), p.name);
            if (next == null) break; // Annuler stops the round
            const name = next.trim().slice(0, 30);
            if (name && name !== p.name) { p.name = name; changed = true; }
        }
        if (changed) { saveProfiles(profiles); render(); }
    });
}
