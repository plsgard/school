// assets/gs/app.js
// Grande Section page: home → 6-item session → done. Wires storage, composer, generators, renderers and speech.
import { getActiveProfileId, loadProfiles, loadSettings, loadSrs, saveSrs, appendSession } from '../storage.js';
import { record, dueCards, boxCounts } from '../core/scheduler.js';
import { compose, GS_CONSTRAINTS } from '../core/session.js';
import { createSpeech, createDeviceSource, createClipSource, SILENT_SOURCE } from '../core/speech.js';
import { celebrate } from '../celebration.js';
import { loadDecks, expandCards } from './decks/index.js';
import { generate, generatePattern } from './generators.js';
import { renderExercise } from './renderers.js';
import { mountParent } from './parent.js';

// R7: local calendar day (France is UTC+1/+2; a UTC date would merge or skip days around midnight).
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.gs-screen')) s.classList.toggle('visually-hidden', s.id !== id); };
const row = (label, value) => {
    const d = document.createElement('div');
    const l = document.createElement('span'); l.textContent = label;
    const v = document.createElement('b'); v.textContent = value;
    d.append(l, v);
    return d;
};

// Fixed UI cues spoken by the page (one text per key; Task 13 records them).
const CUE_LETS_GO = { key: 'ui.lets-go', text: 'C\'est parti !' };
const CUE_DONE = { key: 'ui.done', text: 'Bravo ! Tu as fini pour aujourd\'hui.' };

const profileId = getActiveProfileId();
const profile = loadProfiles().find(p => p.id === profileId) ?? { id: profileId, name: '', avatar: '🦊' };
const settings = loadSettings(profileId);
const decks = await loadDecks();
const cards = expandCards(decks, { firstName: settings.firstName });

let manifest = new Set();
try {
    const res = await fetch('assets/audio/gs/manifest.json');
    if (res.ok) manifest = new Set(await res.json());
} catch { /* no clips yet: device voice fallback */ }
const device = createDeviceSource({ preferredVoice: settings.voice });
const speech = createSpeech({ sources: [createClipSource({ baseUrl: 'assets/audio/gs', manifest }), device, SILENT_SOURCE] });
speech.setSource(settings.audio);
const silent = settings.audio === 'silent';
document.body.classList.toggle('silent', silent);

function renderHome() {
    const srs = loadSrs(profileId, 'gs');
    $('avatar').textContent = profile.avatar || '🦊';
    $('hello').textContent = profile.name ? `Salut ${profile.name} !` : 'Salut !';
    $('today').replaceChildren(
        row('⏱️ Ta partie du jour', `${settings.sessionItems} jeux`),
        row('📚 À revoir', String(dueCards(srs, today()).length)),
        row('📦 Boîtes', boxCounts(srs).join(' · ')),
    );
}

let promptTimer = null;

async function runSession() {
    const sessionProfileId = profileId; // captured: a profile switch mid-session must not leak
    const n = settings.sessionItems;
    let srs = loadSrs(sessionProfileId, 'gs');
    const day = today();
    const { slots, introduced } = compose({ srs, cards, today: day, constraints: { ...GS_CONSTRAINTS, items: n } });
    srs = { ...srs, introduced: { ...srs.introduced, [day]: [...new Set([...(srs.introduced[day] ?? []), ...introduced])] } };
    saveSrs(sessionProfileId, 'gs', srs);

    const exercises = slots.map(c => generate(c, { cards }));
    while (exercises.length < n) exercises.push(generatePattern()); // R13: always a full session
    const items = [];
    const t0 = Date.now();
    show('exercise');
    // First cue inside the "Jouer" gesture: unlocks audio on iOS.
    await speech.speak(CUE_LETS_GO);

    const waitForTap = silent || settings.parentMode; // R6: the adult advances
    const replay = $('replay');
    for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        $('counter').textContent = `${i + 1} / ${exercises.length}`;
        $('progress').replaceChildren(...exercises.map((_, k) => {
            const dot = document.createElement('i');
            if (k < i) dot.className = 'done'; else if (k === i) dot.className = 'now';
            return dot;
        }));
        $('consigne').textContent = ex.prompt.text;
        replay.onclick = () => speech.speak(ex.prompt);
        clearTimeout(promptTimer);
        if (!silent) {
            promptTimer = setTimeout(() => {
                replay.classList.remove('pulse'); void replay.offsetWidth; replay.classList.add('pulse');
                speech.speak(ex.prompt);
            }, 350);
        }
        const result = await renderExercise({ stage: $('stage'), choices: $('choices'), feedback: $('feedback') }, ex,
            { speak: speech.speak, parentMode: settings.parentMode, waitForTap });
        clearTimeout(promptTimer);
        items.push({ cardId: ex.cardId, type: ex.type, ...result });
        if (ex.cardId) { srs = record(srs, ex.cardId, result.correctFirstTry, day); saveSrs(sessionProfileId, 'gs', srs); }
    }

    appendSession(sessionProfileId, 'gs', { date: new Date().toISOString(), items, durationMs: Date.now() - t0 });
    show('done');
    $('doneTitle').textContent = profile.name ? `Bravo ${profile.name} !` : 'Bravo !';
    $('stars').textContent = '⭐'.repeat(items.length); // stars only, no score shown to the child
    $('stars').setAttribute('aria-label', `${items.length} étoiles`);
    $('tomorrow').textContent = 'À demain pour de nouveaux jeux !';
    celebrate({ duration: 3000, pieces: 80 });
    speech.speak(CUE_DONE);
}

$('play').addEventListener('click', () => {
    $('play').disabled = true;
    runSession().catch(err => {
        console.error(err);
        $('play').disabled = false;
        show('home');
    });
});
$('quit').addEventListener('click', () => { clearTimeout(promptTimer); speech.stop(); location.href = 'gs.html'; });
$('parentBtn').addEventListener('click', (e) => {
    e.preventDefault();
    show('parent');
    mountParent($('parent'), { profileId, settings, cards, device, speech, onBack: () => { show('home'); renderHome(); } });
});

renderHome();
show('home');
