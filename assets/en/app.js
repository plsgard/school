// assets/en/app.js
// English track page (6e): home → session (listen-pick, say-it) → done, parent corner behind ⚙️ (long-press).
// UI copy is French (he reads); spoken audio is English only (device en-GB voice).
import { getActiveProfileId, setActiveProfileId, loadProfiles, loadSettings, loadSrs, saveSrs, loadSessions, appendSession } from '../storage.js';
import { recordResult } from '../core/progress.js';
import { createSpeech, createDeviceSource, SILENT_SOURCE } from '../core/speech.js';
import { celebrate } from '../celebration.js';
import { holdToActivate } from '../hold.js';
import { displayName, ensureProfiles, trackProfileId, prefillFirstName } from '../profiles.js';
import { loadDecks, expandCards } from './decks/index.js';
import { generate } from './generators.js';
import { scoreSpeech } from './pronounce.js';
import { listen, abortListening, recognitionSupported, FATAL_ERRORS } from './listen.js';
import { nextCard, enSettings, localDay, streak, EN_PROFILE } from './rules.js';
import { mountParent } from './parent.js';

const NBSP = ' ';
const TRACK = 'en';
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('main > .en-screen')) s.hidden = s.id !== id; };
const today = () => localDay(new Date());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k === 'class') e.className = v;
        else e.setAttribute(k, v === true ? '' : v);
    }
    e.append(...children.flat().filter(c => c != null && c !== false));
    return e;
}

// A full or blocked storage must never stop the game: log and keep playing.
function persist(write) {
    try { write(); } catch (err) { console.warn('[en] progress not saved', err); }
}

let profiles = loadProfiles();
persist(() => { profiles = ensureProfiles(); });
const profileId = trackProfileId(profiles, getActiveProfileId(), TRACK);
if (profileId !== getActiveProfileId()) persist(() => setActiveProfileId(profileId));
const stored = profiles.find(p => p.id === profileId);
const profile = stored ?? { id: profileId, name: '', avatar: '🐼' };
const settings = stored ? prefillFirstName(stored) : loadSettings(profileId);
const opts = () => enSettings(settings); // read on use: the parent corner changes settings without a reload

const decks = await loadDecks();
const cards = expandCards(decks);

const device = createDeviceSource({ lang: 'en', locale: 'en-GB', preferredVoice: opts().enVoice,
    preferred: ['Daniel', 'Serena', 'Kate', 'Oliver', 'Arthur', 'Martha', 'Stephanie', 'Jamie', 'Google UK English'] });
const speech = createSpeech({ sources: [device, SILENT_SOURCE], order: ['device', 'silent'] });
const say = (text) => speech.speak({ text });

// Recognition is used only when the parent allows it and the browser has it; a refused mic switches the
// rest of the session to self-judging.
let micBlocked = false;
const useRecognition = () => opts().mic === 'auto' && recognitionSupported() && !micBlocked;

function renderHome() {
    $('avatar').textContent = profile.avatar || '🐼';
    const name = displayName(profile, settings);
    $('hello').textContent = name ? `Hello, ${name}!` : 'Hello!';
    const n = opts().enItems;
    $('today').textContent = `Séance du jour${NBSP}: ${n}${NBSP}cartes · environ ${Math.round(n * 0.8)}${NBSP}min`;
    $('play').hidden = false;
    const s = streak(loadSessions(profileId, TRACK), today());
    $('streak').hidden = s < 2;
    $('streak').textContent = `🔥 ${s}${NBSP}jours`;
    const warn = opts().mic === 'auto' && !recognitionSupported();
    $('micWarn').hidden = !warn;
    $('micWarn').textContent = '🎤 Ici, le micro ne peut pas vérifier ta prononciation (ouvre la page dans Safari, pas depuis l’écran d’accueil). Tu diras les mots à voix haute et tu t’évalueras toi-même.';
    const srs = loadSrs(profileId, TRACK);
    $('decks').replaceChildren(...decks.map(d => {
        const ids = cards.filter(c => c.deckId === d.id).map(c => c.id);
        const known = ids.filter(id => srs.cards[id]);
        const filled = ids.length ? Math.round(5 * known.reduce((a, id) => a + (srs.cards[id].box - 1) / 4, 0) / ids.length) : 0;
        return el('div', { class: 'en-deck' },
            el('b', {}, d.label),
            el('div', { class: 'en-note' }, `${d.items.length}${NBSP}mots · ${known.length ? `${known.length}/${ids.length} cartes vues` : 'pas encore commencé'}`),
            el('div', { class: 'en-boxes', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map(i => el('span', { class: i < filled ? 'full' : '' }))));
    }));
}

// ---- exercises: each resolves with { correctFirstTry, attempts, ms } ----

function continueButton(label = 'Continuer ▶') {
    return new Promise(resolve => {
        const b = el('button', { type: 'button', class: 'en-cta primary', onclick: () => resolve() }, label);
        $('feedback').append(b);
        b.focus();
    });
}

function answerLine(ex) {
    return el('div', {}, ex.answer.img ? el('span', { class: 'me-2', 'aria-hidden': 'true' }, ex.answer.img) : null,
        el('span', { class: 'answer', lang: 'en' }, ex.answer.en), el('div', { class: 'en-note' }, ex.answer.fr));
}

async function playListenPick(ex) {
    const t0 = Date.now();
    const stage = $('stage');
    const replay = el('button', { type: 'button', class: 'en-speak', 'aria-label': 'Réécouter' }, '🔊');
    replay.onclick = () => say(ex.say);
    let misses = 0;
    return new Promise(resolve => {
        const finish = async (ok) => {
            for (const b of grid.querySelectorAll('button')) b.disabled = true;
            replay.disabled = true;
            grid.querySelector('[data-correct="1"]').classList.add('ok');
            $('feedback').replaceChildren(el('strong', {}, ok ? '✅ Oui !' : '👀 C’était :'), answerLine(ex));
            await say(ex.say);
            if (ok) await sleep(500); else await continueButton();
            resolve({ correctFirstTry: ok && misses === 0, attempts: misses + 1, ms: Date.now() - t0 });
        };
        const grid = el('div', { class: 'en-choices' }, ...ex.choices.map(c => el('button', {
            type: 'button', class: 'en-choice', 'data-correct': c.correct ? '1' : '0',
            onclick: (e) => {
                if (Date.now() - shownAt < 400) return; // the ▶ double tap must not answer blind
                const b = e.currentTarget;
                if (c.correct) { finish(true); return; }
                misses++;
                b.classList.add('ko'); b.disabled = true;
                if (misses >= 2) finish(false);
                else { $('feedback').replaceChildren(el('span', {}, 'Non, réécoute !')); say(ex.say); }
            },
        }, c.img ? el('span', { class: 'img', 'aria-hidden': 'true' }, c.img) : null, el('span', {}, c.fr))));
        stage.replaceChildren(replay, grid);
        const shownAt = Date.now();
        setTimeout(() => say(ex.say), 350);
    });
}

function wordsLine(result) {
    return el('div', { class: 'en-words', lang: 'en' }, ...result.words.flatMap((w, i) => [i ? ' ' : '', el('span', { class: w.heard ? 'hit' : 'miss' }, w.text)]));
}

// Self-judging (no recognition): say it aloud, reveal + model, then 👍 / 👎. Never blocks.
async function selfJudge(ex, t0) {
    const fb = $('feedback');
    fb.replaceChildren(el('span', {}, 'Dis-le à voix haute, puis vérifie.'));
    await new Promise(r => fb.append(el('button', { type: 'button', class: 'en-cta primary', onclick: r }, '👂 Vérifier')));
    fb.replaceChildren(answerLine(ex));
    await say(ex.say);
    const ok = await new Promise(r => fb.append(el('div', { class: 'en-row' },
        el('button', { type: 'button', class: 'en-small-btn', onclick: () => r(true) }, '👍 Je l’ai bien dit'),
        el('button', { type: 'button', class: 'en-small-btn', onclick: () => r(false) }, '👎 Pas encore'))));
    return { correctFirstTry: ok, attempts: 1, ms: Date.now() - t0, selfJudged: true };
}

async function playSayIt(ex) {
    const t0 = Date.now();
    const { precision, tries } = opts();
    $('stage').replaceChildren(el('div', { class: 'en-prompt' },
        ex.img ? el('div', { class: 'img', 'aria-hidden': 'true' }, ex.img) : null,
        el('div', { class: 'fr' }, ex.fr)));
    if (!useRecognition()) return selfJudge(ex, t0);

    const mic = el('button', { type: 'button', class: 'en-speak mic', 'aria-label': 'Parler' }, '🎤');
    const model = el('button', { type: 'button', class: 'en-small-btn', hidden: true, onclick: () => say(ex.say) }, '🔊 Écouter le modèle');
    $('stage').append(mic, el('div', { class: 'en-row' }, model));
    const fb = $('feedback');
    fb.replaceChildren(el('span', {}, 'Touche 🎤 et dis le mot en anglais.'));
    let attempts = 0;
    let silent = 0; // silences / network errors: not tries, but three in a row fall back to self-judging
    for (;;) {
        await new Promise(r => { mic.onclick = r; });
        speech.stop();
        mic.disabled = true; model.disabled = true; mic.classList.add('listening'); // the model must not be heard by the mic
        fb.replaceChildren(el('span', {}, 'Je t’écoute…'));
        const heard = await listen({ lang: 'en-GB' });
        mic.disabled = false; model.disabled = false; mic.classList.remove('listening');
        if (heard.error && FATAL_ERRORS.has(heard.error)) {
            micBlocked = true;
            fb.replaceChildren(el('span', {}, '🎤 Le micro n’est pas disponible. On continue sans.'));
            await sleep(1200);
            mic.remove(); model.remove();
            return selfJudge(ex, t0);
        }
        if (!heard.alternatives.length) { // silence, network: not a try
            if (++silent >= 3) {
                mic.remove(); model.remove();
                return selfJudge(ex, t0);
            }
            fb.replaceChildren(el('span', {}, 'Je n’ai rien entendu. Réessaie !'));
            continue;
        }
        silent = 0;
        attempts++;
        const result = scoreSpeech(ex.expected, heard.alternatives.map(a => a.transcript), precision);
        if (result.ok) {
            mic.disabled = true;
            fb.replaceChildren(el('strong', {}, '✅ Bravo !'), wordsLine(result));
            await say(ex.say);
            await sleep(400);
            return { correctFirstTry: attempts === 1, attempts, ms: Date.now() - t0 };
        }
        const heardLine = el('div', { class: 'en-heard' }, `On a entendu${NBSP}: «${NBSP}`, el('span', { lang: 'en' }, result.heard), `${NBSP}»`);
        if (attempts >= tries) {
            mic.disabled = true; model.hidden = true;
            fb.replaceChildren(heardLine, el('strong', {}, 'Écoute bien et répète-le :'), answerLine(ex));
            await say(ex.say);
            await continueButton('On continue ▶');
            return { correctFirstTry: false, attempts, ms: Date.now() - t0 };
        }
        model.hidden = false;
        fb.replaceChildren(heardLine, wordsLine(result), el('span', {}, `${result.score > 0 ? 'Presque' : 'Pas encore'} ! Écoute le modèle et réessaie (${attempts}/${tries}).`));
    }
}

// ---- session ----

let running = false;

async function runSession() {
    running = true;
    const sessionProfileId = profileId;
    const n = opts().enItems;
    const day = today();
    let srs = loadSrs(sessionProfileId, TRACK);
    const played = new Set();
    const items = [];
    const t0 = Date.now();
    show('exercise');
    for (let i = 0; i < n && running; i++) {
        const card = nextCard({ srs, cards, played, today: day });
        if (!card) break;
        played.add(card.id);
        const ex = generate(card, { cards });
        $('counter').textContent = `${i + 1} / ${n}`;
        $('progress').style.width = `${(100 * i) / n}%`;
        $('consigne').textContent = ex.consigne;
        $('feedback').replaceChildren();
        const result = ex.type === 'listen-pick' ? await playListenPick(ex) : await playSayIt(ex);
        if (!running) return;
        items.push({ cardId: card.id, type: ex.type, ...result });
        srs = recordResult(srs, card.id, result.correctFirstTry, day, EN_PROFILE);
        persist(() => saveSrs(sessionProfileId, TRACK, srs));
    }
    running = false;
    if (!items.length) { show('home'); renderHome(); return; }
    persist(() => appendSession(sessionProfileId, TRACK, { date: new Date().toISOString(), items, durationMs: Date.now() - t0 }));
    renderDone(items);
}

function renderDone(items) {
    show('done');
    const right = items.filter(x => x.correctFirstTry).length;
    const name = displayName(profile, settings);
    $('doneTitle').textContent = name ? `Well done, ${name}!` : 'Well done!';
    const s = streak(loadSessions(profileId, TRACK), today());
    $('doneScore').textContent = `${right}${NBSP}/ ${items.length} du premier coup${s >= 2 ? ` · 🔥 ${s}${NBSP}jours d’affilée` : ''}`;
    const misses = [...new Map(items.filter(x => !x.correctFirstTry).map(x => {
        const c = cards.find(k => k.id === x.cardId);
        return [c.item.id, c.item];
    })).values()];
    $('rework').replaceChildren(...(misses.length ? [
        el('h2', { class: 'h5' }, 'À retravailler'),
        el('ul', { class: 'en-done-list' }, ...misses.map(it => el('li', {}, el('span', {}, it.fr), el('b', { lang: 'en' }, it.en[0])))),
    ] : [el('p', { class: 'en-note' }, 'Tout juste du premier coup !')]));
    if (right === items.length) celebrate({ duration: 3000, pieces: 80 });
    say(right === items.length ? 'Perfect! Well done!' : 'Well done!');
}

function start() {
    $('play').disabled = true;
    // iOS: the first utterance must start inside the tap.
    try { globalThis.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
    runSession().catch(err => { console.error(err); running = false; show('home'); renderHome(); })
        .finally(() => { $('play').disabled = false; });
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

// 🏠 quits on a 0.8 s hold or two taps within 2 s.
function quit() { running = false; abortListening(); speech.stop(); location.href = 'en.html'; }
{
    const btn = $('quit');
    let hold = null, armed = null;
    const release = () => { clearTimeout(hold); hold = null; };
    btn.addEventListener('pointerdown', () => { release(); hold = setTimeout(quit, 800); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
    btn.addEventListener('click', () => {
        if (armed) { quit(); return; }
        armed = setTimeout(() => { armed = null; }, 2000);
    });
}

holdToActivate($('parentBtn'), () => {
    show('parent');
    mountParent($('parent'), { profileId, settings, cards, decks, device, speech, onBack: () => { show('home'); renderHome(); } });
});
holdToActivate($('avatar'), () => { location.href = 'index.html'; });

renderHome();
show('home');
