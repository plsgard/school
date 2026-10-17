// assets/gs/app.js
// Grande Section page: home → 6-item daily session → done, or home → themed practice round → done (🔁 Encore).
// Wires storage, composers, generators, renderers and speech.
import { getActiveProfileId, setActiveProfileId, loadProfiles, loadSettings, loadSrs, saveSrs, loadSessions, appendSession, appendPractice } from '../storage.js';
import { recordResult, recordPractice } from '../core/progress.js';
import { compose, GS_CONSTRAINTS, composePractice, GS_PRACTICE } from '../core/session.js';
import { createSpeech, createDeviceSource, createClipSource, SILENT_SOURCE } from '../core/speech.js';
import { celebrate } from '../celebration.js';
import { loadDecks, expandCards } from './decks/index.js';
import { generate, generatePattern } from './generators.js';
import { renderExercise, disposeExercise } from './renderers.js';
import { PAGE_CUES } from './cues.js';
import { mountParent } from './parent.js';
import { localDay, dailyCapReached, effectiveParentMode, practiceItems } from './rules.js';
import { THEMES, inTheme } from './themes.js';
import { displayName, prefillFirstName, ensureProfiles, trackProfileId } from '../profiles.js';
import { pruneNameCards } from './name-cards.js';
import { sayInput } from './say.js';
import { holdToActivate } from '../hold.js';

const today = () => localDay(new Date());
const $ = (id) => document.getElementById(id);
// `hidden` (display: none), not .visually-hidden: a hidden control must not stay focusable.
const show = (id) => { for (const s of document.querySelectorAll('.gs-screen')) s.hidden = s.id !== id; };
const NBSP = '\u00a0'; // French typography: non-breaking space before ! ? :

// Fixed UI cues spoken by the page live in cues.js (pure, so tools/cues.mjs can record them).
const { letsGo: CUE_LETS_GO, comeBackTomorrow: CUE_TOMORROW, done: CUE_DONE } = PAGE_CUES;

// I5: opened without a GS profile active (home-screen web app with empty storage, or after picking 🐼): play as the
// first GS profile. The picker is never forced, so there is no redirect loop.
let profiles = loadProfiles();
persist(() => { profiles = ensureProfiles(); });
const profileId = trackProfileId(profiles, getActiveProfileId(), 'gs');
if (profileId !== getActiveProfileId()) persist(() => setActiveProfileId(profileId));
const stored = profiles.find(p => p.id === profileId);
const profile = stored ?? { id: profileId, name: '', avatar: '🦊' };
// One name per child (see profiles.js): a named profile seeds the first name once.
const settings = stored ? prefillFirstName(stored) : loadSettings(profileId);
persist(() => pruneNameCards(profileId, settings.firstName)); // the first name may have changed on the picker
const decks = await loadDecks();
// Rebuilt when the parent corner closes: a new first name changes the name-spell card of the next session.
let cards = expandCards(decks, { firstName: settings.firstName });

let manifest = new Set();
try {
    const res = await fetch('assets/audio/gs/manifest.json');
    if (res.ok) manifest = new Set(await res.json());
} catch { /* no clips yet: device voice fallback */ }
const device = createDeviceSource({ preferredVoice: settings.voice, transform: sayInput }); // I2: "fff" is a sound, not letter names
const clips = createClipSource({ baseUrl: 'assets/audio/gs', manifest });
const speech = createSpeech({ sources: [clips, device, SILENT_SOURCE] });
speech.setSource(settings.audio);
// Settings can change in the parent corner without a reload: read them when needed, never cache them.
const isSilent = () => settings.audio === 'silent';
const parentModeOn = () => effectiveParentMode(settings, { hasFrenchVoice: device.listVoices().length > 0, hasClips: manifest.size > 0 });
document.body.classList.toggle('silent', isSilent());

// Child-facing home: avatar, greeting, one ⭐ per game of the day, ▶ Jouer. Stats live in the parent corner.
// Spec §13 R4: one completed session a day; the parent corner can allow exactly one more today (R24).
const playedToday = () => dailyCapReached(loadSessions(profileId, 'gs'), settings, today());

function renderHome() {
    const rest = playedToday();
    $('play').hidden = rest;
    $('today').hidden = rest;
    $('moon').hidden = !rest;
    // P12: no 🌟 next to the 🌙, one signal at a time. Guarded: a cached older gs.html lacks these ids.
    if ($('moonCaption')) $('moonCaption').hidden = !rest;
    if ($('homeHero')) $('homeHero').hidden = rest;
    $('avatar').textContent = profile.avatar || '🦊';
    const name = displayName(profile, settings);
    $('hello').textContent = name ? `Salut ${name}${NBSP}!` : `Salut${NBSP}!`;
    $('today').textContent = '⭐'.repeat(settings.sessionItems);
    $('today').setAttribute('aria-label', `${settings.sessionItems} jeux aujourd'hui`);
    // Practice never consumes the daily cap: the theme buttons stay under the 🌙 too. A theme with no card is hidden.
    for (const b of $('themes').children) b.hidden = !cards.some(inTheme(b.dataset.theme));
}

// One big picture button per theme; the caption is for the adult, the picture for the child.
function buildThemes() {
    $('themes').replaceChildren(...THEMES.map(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gs-theme';
        b.dataset.theme = t.id;
        b.setAttribute('aria-label', `Jouer${NBSP}: ${t.label}`);
        const emoji = document.createElement('span');
        emoji.className = 'gs-theme-emoji';
        emoji.setAttribute('aria-hidden', 'true');
        emoji.textContent = t.emoji;
        const label = document.createElement('small');
        label.textContent = t.label;
        b.append(emoji, label);
        return b;
    }));
}

// iOS only lets audio play after it was started inside a user gesture: prime both engines in the "Jouer" tap.
function unlockAudio() {
    try { clips.unlock(); } catch { /* no Audio */ }
    try { if (globalThis.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
}

let promptTimer = null;

// M9: a full or blocked storage (quota, private mode) must never stop a child's game: log and keep playing.
function persist(write) {
    try { write(); } catch (err) { console.warn('[gs] progress not saved', err); }
}

// I3: warm the HTTP cache with a round's clips, so the first play of each is not a network round trip.
const preloadClips = (exercises) =>
    clips.preload(exercises.flatMap(ex => [ex.prompt, ex.success, ex.reveal, ex.trace?.say, ...(ex.choices ?? []).map(c => c.say)]));

// Plays exercises one by one (counter, progress dots, consigne, prompt autoplay) and returns the answered items.
// onAnswered(ex, result) records the answer and returns extra fields merged into the item (e.g. { preview: true }).
async function play(exercises, onAnswered, { badge } = {}) {
    const items = [];
    const silent = isSilent();
    const parentMode = parentModeOn();
    const waitForTap = silent || parentMode; // R6: the adult advances
    const replay = $('replay');
    const settle = () => { clearTimeout(promptTimer); replay.disabled = true; };
    for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        $('counter').textContent = badge ? `${badge} ${i + 1} / ${exercises.length}` : `${i + 1} / ${exercises.length}`;
        $('progress').replaceChildren(...exercises.map((_, k) => {
            const dot = document.createElement('i');
            if (k < i) dot.className = 'done'; else if (k === i) dot.className = 'now';
            return dot;
        }));
        $('consigne').textContent = ex.prompt.display ?? ex.prompt.text; // I6: written form, never phonetic spelling
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
        items.push({ cardId: ex.cardId, type: ex.type, ...result, ...onAnswered(ex, result) });
    }
    return items;
}

// Done screen: the daily variant says "À demain"; the practice variant offers 🔁 Encore on the same theme.
function showDone(items, { again = null } = {}) {
    show('done');
    const name = displayName(profile, settings);
    $('doneTitle').textContent = name ? `Bravo ${name}${NBSP}!` : `Bravo${NBSP}!`;
    $('doneHero').textContent = `${profile.avatar || '🦊'}🎉`;
    $('stars').textContent = '⭐'.repeat(items.length); // stars only, no score shown to the child
    $('stars').setAttribute('aria-label', `${items.length} étoiles`);
    $('tomorrow').textContent = `À demain pour de nouveaux jeux${NBSP}!`;
    $('tomorrow').hidden = again != null;
    $('again').hidden = again == null;
    if (again != null) $('again').dataset.theme = again;
    celebrate({ duration: 3000, pieces: 80 });
}

async function runSession() {
    const sessionProfileId = profileId; // captured: a profile switch mid-session must not leak
    const n = settings.sessionItems;
    let srs = loadSrs(sessionProfileId, 'gs');
    const day = today();
    // Items count as introduced only when one of their cards is answered (recordResult), never at session start.
    const { slots } = compose({ srs, cards, today: day, constraints: { ...GS_CONSTRAINTS, items: n } });

    const exercises = slots.map(c => generate(c, { cards }));
    while (exercises.length < n) exercises.push(generatePattern()); // R13: always a full session
    preloadClips(exercises);
    const t0 = Date.now();
    show('exercise');
    // First cue inside the "Jouer" gesture: unlocks audio on iOS.
    await speech.speak(CUE_LETS_GO);

    const items = await play(exercises, (ex, result) => {
        if (ex.cardId) {
            srs = recordResult(srs, ex.cardId, result.correctFirstTry, day);
            persist(() => saveSrs(sessionProfileId, 'gs', srs));
        }
        return {};
    });

    persist(() => appendSession(sessionProfileId, 'gs', { date: new Date().toISOString(), items, durationMs: Date.now() - t0 }));
    showDone(items);
    speech.speak(CUE_DONE);
}

// Themed practice round (spec 2026-10-18 §9.2): as many as she wants, stored apart from the daily sessions so the
// daily cap (▶ Jouer / 🌙) never moves. Preview cards (a theme she has barely met) are played, never recorded.
const lastRound = new Map(); // theme id → card ids of its previous round: 🔁 Encore plays something else first

async function runPractice(themeId) {
    const sessionProfileId = profileId;
    const theme = THEMES.find(t => t.id === themeId);
    let srs = loadSrs(sessionProfileId, 'gs');
    const day = today();
    const { slots, preview } = composePractice({ srs, cards, today: day, include: inTheme(themeId),
        constraints: { ...GS_PRACTICE, items: practiceItems(settings) }, recent: lastRound.get(themeId) ?? [] });
    if (!slots.length) { show('home'); renderHome(); return; }
    lastRound.set(themeId, slots.map(s => s.id));
    const previewIds = new Set(preview);
    const exercises = slots.map(c => generate(c, { cards }));
    preloadClips(exercises);
    const t0 = Date.now();
    show('exercise');
    await speech.speak(PAGE_CUES.practice[themeId]); // first cue inside the tap: unlocks audio on iOS

    const items = await play(exercises, (ex, result) => {
        if (previewIds.has(ex.cardId)) return { preview: true };
        srs = recordPractice(srs, ex.cardId, result.correctFirstTry, day);
        persist(() => saveSrs(sessionProfileId, 'gs', srs));
        return {};
    }, { badge: theme.emoji });

    persist(() => appendPractice(sessionProfileId, 'gs', { date: new Date().toISOString(), theme: themeId, items, durationMs: Date.now() - t0 }));
    showDone(items, { again: themeId });
    speech.speak(PAGE_CUES.practiceDone);
}

// A round starts from a tap (▶ Jouer, a theme button, 🔁 Encore): a second tap while it starts is ignored, and a
// crash brings the child back home instead of a frozen screen.
let busy = false;
function start(run) {
    if (busy) return;
    busy = true;
    unlockAudio();
    run().catch(err => {
        console.error(err);
        clearTimeout(promptTimer);
        speech.stop();
        disposeExercise();
        $('play').disabled = false;
        show('home');
        renderHome();
    }).finally(() => { busy = false; });
}

$('play').addEventListener('click', () => {
    if (busy) return;
    $('play').disabled = true;
    start(runSession);
});
$('themes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-theme]');
    if (b) start(() => runPractice(b.dataset.theme));
});
$('again').addEventListener('click', () => start(() => runPractice($('again').dataset.theme)));

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
holdToActivate($('parentBtn'), openParent);
holdToActivate($('avatar'), () => { location.href = 'index.html'; });

buildThemes();
renderHome();
show('home');
