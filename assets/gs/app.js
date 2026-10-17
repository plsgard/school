// assets/gs/app.js
// Grande Section page: home → 6-item session → done. Wires storage, composer, generators, renderers and speech.
import { getActiveProfileId, loadProfiles, loadSettings, loadSrs, saveSrs, loadSessions, appendSession } from '../storage.js';
import { recordResult } from '../core/progress.js';
import { compose, GS_CONSTRAINTS } from '../core/session.js';
import { createSpeech, createDeviceSource, createClipSource, SILENT_SOURCE } from '../core/speech.js';
import { celebrate } from '../celebration.js';
import { loadDecks, expandCards } from './decks/index.js';
import { generate, generatePattern } from './generators.js';
import { renderExercise, disposeExercise } from './renderers.js';
import { mountParent } from './parent.js';
import { localDay, dailyCapReached, effectiveParentMode } from './rules.js';

const today = () => localDay(new Date());
const $ = (id) => document.getElementById(id);
// `hidden` (display: none), not .visually-hidden: a hidden control must not stay focusable.
const show = (id) => { for (const s of document.querySelectorAll('.gs-screen')) s.hidden = s.id !== id; };
const NBSP = '\u00a0'; // French typography: non-breaking space before ! ? :

// Fixed UI cues spoken by the page (one text per key; Task 13 records them).
const CUE_LETS_GO = { key: 'ui.lets-go', text: 'C\'est parti !' };
const CUE_TOMORROW = { key: 'ui.come-back-tomorrow', text: 'Tu as déjà joué aujourd\'hui. À demain\u00a0!' };
const CUE_DONE = { key: 'ui.done', text: 'Bravo ! Tu as fini pour aujourd\'hui.' };

const profileId = getActiveProfileId();
const profile = loadProfiles().find(p => p.id === profileId) ?? { id: profileId, name: '', avatar: '🦊' };
const settings = loadSettings(profileId);
const decks = await loadDecks();
// Rebuilt when the parent corner closes: a new first name changes the name-spell card of the next session.
let cards = expandCards(decks, { firstName: settings.firstName });

let manifest = new Set();
try {
    const res = await fetch('assets/audio/gs/manifest.json');
    if (res.ok) manifest = new Set(await res.json());
} catch { /* no clips yet: device voice fallback */ }
const device = createDeviceSource({ preferredVoice: settings.voice });
const clips = createClipSource({ baseUrl: 'assets/audio/gs', manifest });
const speech = createSpeech({ sources: [clips, device, SILENT_SOURCE] });
speech.setSource(settings.audio);
// Settings can change in the parent corner without a reload: read them when needed, never cache them.
const isSilent = () => settings.audio === 'silent';
const parentModeOn = () => effectiveParentMode(settings, device.listVoices().length > 0);
document.body.classList.toggle('silent', isSilent());

// Child-facing home: avatar, greeting, one ⭐ per game of the day, ▶ Jouer. Stats live in the parent corner.
// Spec §13 R4: one completed session a day; the parent corner can allow exactly one more today (R24).
const playedToday = () => dailyCapReached(loadSessions(profileId, 'gs'), settings, today());

function renderHome() {
    const rest = playedToday();
    $('play').hidden = rest;
    $('today').hidden = rest;
    $('moon').hidden = !rest;
    $('avatar').textContent = profile.avatar || '🦊';
    $('hello').textContent = profile.name ? `Salut ${profile.name}${NBSP}!` : `Salut${NBSP}!`;
    $('today').textContent = '⭐'.repeat(settings.sessionItems);
    $('today').setAttribute('aria-label', `${settings.sessionItems} jeux aujourd'hui`);
}

// iOS only lets audio play after it was started inside a user gesture: prime both engines in the "Jouer" tap.
function unlockAudio() {
    try { clips.unlock(); } catch { /* no Audio */ }
    try { if (globalThis.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
}

let promptTimer = null;

async function runSession() {
    const sessionProfileId = profileId; // captured: a profile switch mid-session must not leak
    const n = settings.sessionItems;
    let srs = loadSrs(sessionProfileId, 'gs');
    const day = today();
    // Items count as introduced only when one of their cards is answered (recordResult), never at session start.
    const { slots } = compose({ srs, cards, today: day, constraints: { ...GS_CONSTRAINTS, items: n } });

    const exercises = slots.map(c => generate(c, { cards }));
    while (exercises.length < n) exercises.push(generatePattern()); // R13: always a full session
    const items = [];
    const t0 = Date.now();
    show('exercise');
    // First cue inside the "Jouer" gesture: unlocks audio on iOS.
    await speech.speak(CUE_LETS_GO);

    const silent = isSilent();
    const parentMode = parentModeOn();
    const waitForTap = silent || parentMode; // R6: the adult advances
    const replay = $('replay');
    const settle = () => { clearTimeout(promptTimer); replay.disabled = true; };
    for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        $('counter').textContent = `${i + 1} / ${exercises.length}`;
        $('progress').replaceChildren(...exercises.map((_, k) => {
            const dot = document.createElement('i');
            if (k < i) dot.className = 'done'; else if (k === i) dot.className = 'now';
            return dot;
        }));
        $('consigne').textContent = ex.prompt.text;
        replay.disabled = false;
        replay.onclick = () => speech.speak(ex.prompt);
        clearTimeout(promptTimer);
        if (!silent) {
            promptTimer = setTimeout(() => {
                replay.classList.remove('pulse'); void replay.offsetWidth; replay.classList.add('pulse');
                speech.speak(ex.prompt);
            }, 350);
        }
        const result = await renderExercise({ stage: $('stage'), choices: $('choices'), feedback: $('feedback'), adult: $('adult') }, ex,
            { speak: speech.speak, parentMode, waitForTap, onSettle: settle });
        clearTimeout(promptTimer);
        items.push({ cardId: ex.cardId, type: ex.type, ...result });
        if (ex.cardId) { srs = recordResult(srs, ex.cardId, result.correctFirstTry, day); saveSrs(sessionProfileId, 'gs', srs); }
    }

    appendSession(sessionProfileId, 'gs', { date: new Date().toISOString(), items, durationMs: Date.now() - t0 });
    show('done');
    $('doneTitle').textContent = profile.name ? `Bravo ${profile.name}${NBSP}!` : `Bravo${NBSP}!`;
    $('stars').textContent = '⭐'.repeat(items.length); // stars only, no score shown to the child
    $('stars').setAttribute('aria-label', `${items.length} étoiles`);
    $('tomorrow').textContent = 'À demain pour de nouveaux jeux !';
    celebrate({ duration: 3000, pieces: 80 });
    speech.speak(CUE_DONE);
}

$('play').addEventListener('click', () => {
    $('play').disabled = true;
    unlockAudio();
    runSession().catch(err => {
        console.error(err);
        clearTimeout(promptTimer);
        speech.stop();
        disposeExercise();
        $('play').disabled = false;
        show('home');
    });
});

$('moon').addEventListener('click', () => { unlockAudio(); speech.speak(CUE_TOMORROW); });

// Any touch in the exercise is an explicit user action: the pending auto-play must not cut what it starts.
$('exercise').addEventListener('pointerdown', () => clearTimeout(promptTimer), true);

// 🏠 quits on a long-press (0.8 s, the button fills up) or on a second tap within 2 s; one stray tap does nothing.
function quit() { clearTimeout(promptTimer); speech.stop(); disposeExercise(); location.href = 'gs.html'; }
{
    const btn = $('quit');
    let hold = null, armed = null;
    const release = () => { clearTimeout(hold); hold = null; btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', () => { release(); btn.classList.add('holding'); hold = setTimeout(quit, 800); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
        if (armed) { quit(); return; }
        btn.classList.add('armed');
        armed = setTimeout(() => { armed = null; btn.classList.remove('armed'); }, 2000);
    });
}
// Parental gate: ⚙️ (parent corner) and 🦊 (profile picker) open only on a 1.5 s long-press that fills the button.
// A child's tap does nothing and says nothing.
function holdToOpen(btn, open, ms = 1500) {
    let hold = null;
    btn.classList.add('gs-hold');
    btn.style.setProperty('--hold-ms', `${ms}ms`);
    const release = () => { clearTimeout(hold); hold = null; btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        release();
        btn.classList.add('holding');
        hold = setTimeout(() => { release(); open(); }, ms);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.preventDefault()); // a tap on the link must not navigate
}

function openParent() {
    show('parent');
    mountParent($('parent'), {
        profileId, settings, cards, device, speech, today: today(), parentModeOn,
        onBack: () => {
            cards = expandCards(decks, { firstName: settings.firstName });
            show('home');
            renderHome();
        },
    });
}
holdToOpen($('parentBtn'), openParent);
holdToOpen($('avatar'), () => { location.href = 'index.html'; });

renderHome();
show('home');
