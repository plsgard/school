// assets/en/app.js
// English track page (6e): home → session (listen-pick, say-it) → done, parent corner behind ⚙️ (long-press).
// A lesson made from photos of the notebook has its own session ("Réviser cette leçon"): written exercises on a
// ladder (ladder.js), composed by lesson-session.js. The daily session only reviews what was learnt there.
// UI copy is French (he reads); spoken audio is English only (device en-GB voice).
import { getActiveProfileId, setActiveProfileId, loadProfiles, loadSettings, saveSettings, loadSrs, saveSrs, loadLearn, saveLearn, loadSessions, appendSession } from '../storage.js';
import { recordResult } from '../core/progress.js';
import { createSpeech, createDeviceSource, SILENT_SOURCE } from '../core/speech.js';
import { celebrate } from '../celebration.js';
import { holdToActivate } from '../hold.js';
import { displayName, ensureProfiles, trackProfileId, prefillFirstName } from '../profiles.js';
import { loadDecks, expandCards } from './decks/index.js';
import { generate } from './generators.js';
import { scoreSpeech } from './pronounce.js';
import { listen, abortListening, recognitionSupported, FATAL_ERRORS, micLogEntry, MIC_LOG_SIZE } from './listen.js';
import { nextCard, enSettings, localDay, streak, EN_PROFILE } from './rules.js';
import { mountParent } from './parent.js';
import { LEARN_KINDS, FORMATS, topLevel, isKnown, isMastered } from './ladder.js';
import { nextStep, afterAnswer, applyStep } from './lesson-session.js';
import { generateLesson } from './lesson-generators.js';
import { playLesson } from './lesson-play.js';
import { resolveItem } from './today.js';

const NBSP = ' ';
const TRACK = 'en';
const UNITS = { vocab: 'mots', grammar: 'phrases', text: 'vers' };
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
const profile = stored ?? { id: profileId, name: '', avatar: '🦁' };
const settings = stored ? prefillFirstName(stored) : loadSettings(profileId);
const opts = () => enSettings(settings); // read on use: the parent corner changes settings without a reload

const decks = await loadDecks();
const cards = expandCards(decks);
// Lessons made from photos: their decks carry `lesson`; the others are the stand-alone decks.
const lessons = [...new Map(decks.filter(d => d.lesson).map(d => [d.lesson.id, d.lesson])).values()];
const isLearn = (c) => LEARN_KINDS.includes(c.kind);

const device = createDeviceSource({ lang: 'en', locale: 'en-GB', preferredVoice: opts().enVoice,
    preferred: ['Daniel', 'Serena', 'Kate', 'Oliver', 'Arthur', 'Martha', 'Stephanie', 'Jamie', 'Google UK English'] });
const speech = createSpeech({ sources: [device, SILENT_SOURCE], order: ['device', 'silent'] });
const say = (text) => speech.speak({ text });
// Dictation (the top level of a phrase) needs an English voice on this device.
const hasVoice = () => device.listVoices().length > 0;
const lessonUi = () => ({ stage: $('stage'), feedback: $('feedback'), say, el, sleep });

// Recognition is used only when the parent allows it and the browser has it; a refused mic switches the
// rest of the session to self-judging.
let micBlocked = false;
const useRecognition = () => opts().mic === 'auto' && recognitionSupported() && !micBlocked;

function renderHome() {
    $('avatar').textContent = profile.avatar || '🦁';
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
    const learn = loadLearn(profileId, TRACK);
    $('decks').replaceChildren(...lessons.map(l => lessonCard(l, learn)), ...decks.filter(d => !d.lesson).map(d => {
        const ids = cards.filter(c => c.deckId === d.id).map(c => c.id);
        const known = ids.filter(id => srs.cards[id]);
        const filled = ids.length ? Math.round(5 * known.reduce((a, id) => a + (srs.cards[id].box - 1) / 4, 0) / ids.length) : 0;
        return el('div', { class: 'en-deck' },
            el('b', {}, d.label),
            el('div', { class: 'en-note' }, `${d.items.length}${NBSP}${UNITS[d.kind] ?? 'mots'} · ${known.length ? `${known.length}/${ids.length} cartes vues` : 'pas encore commencé'}`),
            el('div', { class: 'en-boxes', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map(i => el('span', { class: i < filled ? 'full' : '' }))));
    }));
}

function examLine(exam) {
    if (!exam) return null;
    const days = Math.round((Date.parse(`${exam}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5);
    if (days < 0) return null;
    return days === 0 ? `Contrôle aujourd’hui${NBSP}!` : days === 1 ? `Contrôle demain${NBSP}!` : `Contrôle dans ${days}${NBSP}jours`;
}

// One card per lesson: what he can already write from memory, the test countdown and the lesson's own session.
function lessonCard(lesson, learn) {
    const items = cards.filter(c => c.deck.lesson?.id === lesson.id && isLearn(c));
    const known = items.filter(c => isKnown(learn.cards[c.id])).length;
    const mastered = items.filter(c => isMastered(learn.cards[c.id])).length;
    const filled = items.length ? Math.round((5 * known) / items.length) : 0;
    const exam = examLine(lesson.exam);
    return el('div', { class: 'en-deck en-lesson' },
        el('b', {}, lesson.label),
        exam ? el('div', { class: 'en-exam' }, `📅 ${exam}`) : null,
        el('div', { class: 'en-note' }, known
            ? `${known}/${items.length} écrits de mémoire${mastered ? ` · ${mastered} acquis` : ''}`
            : `${items.length}${NBSP}mots et phrases · pas encore commencé`),
        el('div', { class: 'en-boxes', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map(i => el('span', { class: i < filled ? 'full' : '' }))),
        el('button', { type: 'button', class: 'en-cta primary en-lesson-play', onclick: () => start(lesson.id) }, '▶ Réviser cette leçon'));
}

// The last in-session listens, for the parent corner (what the iPad really returned during exercises).
function logListen(r) {
    const log = [micLogEntry(r, new Date()), ...(settings.enMicLog ?? [])].slice(0, MIC_LOG_SIZE);
    persist(() => Object.assign(settings, saveSettings(profileId, { enMicLog: log })));
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

// What is shown above the mic: say-it a picture + French; line-repeat the line (+ French); line-next the previous line.
function promptFor(ex) {
    if (ex.type === 'say-it') {
        return el('div', { class: 'en-prompt' },
            ex.img ? el('div', { class: 'img', 'aria-hidden': 'true' }, ex.img) : null,
            el('div', { class: 'fr' }, ex.fr));
    }
    if (ex.type === 'line-repeat') {
        return el('div', { class: 'en-prompt' }, el('div', { class: 'en-line', lang: 'en' }, ex.shown), el('div', { class: 'en-note' }, ex.fr));
    }
    return el('div', { class: 'en-prompt' },
        el('div', { class: 'en-note' }, `🎃 ${ex.title}`),
        el('div', { class: 'en-line prev', lang: 'en' }, ex.prev ? `${ex.prev}` : '…'),
        el('div', { class: 'en-line', 'aria-hidden': 'true' }, '…'));
}

async function playGapPick(ex) {
    const t0 = Date.now();
    let misses = 0;
    const shownAt = Date.now();
    $('stage').replaceChildren(el('div', { class: 'en-prompt' },
        el('div', { class: 'en-line', lang: 'en' }, ex.gap),
        ex.fr ? el('div', { class: 'en-note' }, ex.fr) : null));
    return new Promise(resolve => {
        const finish = async (ok) => {
            for (const b of grid.querySelectorAll('button')) b.disabled = true;
            grid.querySelector('[data-correct="1"]').classList.add('ok');
            $('feedback').replaceChildren(el('strong', {}, ok ? '✅ Oui\u00a0!' : '👀 La bonne réponse\u00a0:'), el('div', { class: 'answer', lang: 'en' }, ex.filled));
            await say(ex.say);
            if (ok) await sleep(500); else await continueButton();
            resolve({ correctFirstTry: ok && misses === 0, attempts: misses + 1, ms: Date.now() - t0 });
        };
        const grid = el('div', { class: 'en-choices' }, ...ex.choices.map(c => el('button', {
            type: 'button', class: 'en-choice', lang: 'en', 'data-correct': c.correct ? '1' : '0',
            onclick: (e) => {
                if (Date.now() - shownAt < 400) return;
                if (c.correct) { finish(true); return; }
                misses++;
                e.currentTarget.classList.add('ko'); e.currentTarget.disabled = true;
                if (misses >= 2) finish(false); else $('feedback').replaceChildren(el('span', {}, 'Non, réessaie\u00a0!'));
            },
        }, c.text)));
        $('stage').append(grid);
    });
}

async function playSayIt(ex) {
    const t0 = Date.now();
    const { precision, tries } = opts();
    const repeat = ex.type === 'line-repeat';
    $('stage').replaceChildren(promptFor(ex));
    if (repeat) await sleep(350).then(() => say(ex.say)); // listen first, then repeat
    if (!useRecognition()) return selfJudge(ex, t0);

    const mic = el('button', { type: 'button', class: 'en-speak mic', 'aria-label': 'Parler' }, '🎤');
    // The model is there from the start when repeating; otherwise only after a miss (it would give the answer).
    const model = el('button', { type: 'button', class: 'en-small-btn', hidden: !repeat, onclick: () => say(ex.say) }, '🔊 Écouter le modèle');
    $('stage').append(mic, el('div', { class: 'en-row' }, model));
    const fb = $('feedback');
    fb.replaceChildren(el('span', {}, ex.type === 'say-it' ? 'Touche 🎤 et dis-le en anglais.' : 'Touche 🎤 et récite le vers.'));
    let attempts = 0;
    let silent = 0; // silences / network errors: not tries, but three in a row fall back to self-judging
    for (;;) {
        // listen() must start inside the tap itself: iPad Safari gives a recogniser started after the tap handler
        // returned (a promise continuation) that runs but hears nothing. The parent corner's test always did this.
        const heard = await new Promise(r => {
            mic.onclick = () => {
                speech.stop();
                mic.disabled = true; model.disabled = true; mic.classList.add('listening'); // the model must not be heard by the mic
                fb.replaceChildren(el('span', {}, 'Je t’écoute…'));
                r(listen({ lang: 'en-GB' }));
            };
        });
        logListen(heard);
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
        const result = scoreSpeech(ex.expected, heard.alternatives.map(a => a.transcript), precision, { sentence: !!ex.sentence });
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

const playExisting = (ex) => (ex.type === 'listen-pick' ? playListenPick(ex) : ex.type === 'gap-pick' ? playGapPick(ex) : playSayIt(ex));

// "Réviser cette leçon": the lesson's own session (lesson-session.js decides each exercise).
async function runLessonSession(lessonId) {
    running = true;
    const sessionProfileId = profileId;
    const lesson = lessons.find(l => l.id === lessonId);
    const lessonCards = cards.filter(c => c.deck.lesson?.id === lessonId);
    const total = opts().enItems;
    const day = today();
    const voice = hasVoice();
    let srs = loadSrs(sessionProfileId, TRACK);
    let learn = loadLearn(sessionProfileId, TRACK);
    let owed = [];
    let newCount = 0;
    const history = [];
    const items = [];
    const t0 = Date.now();
    show('exercise');
    for (let index = 0; index < total && running; index++) {
        const step = nextStep({ cards: lessonCards, srs, learn, today: day, exam: lesson.exam, hasVoice: voice, history, owed, index, total, newCount });
        if (!step) break;
        if (step.isNew) newCount++;
        const { card } = step;
        const ex = isLearn(card) ? generateLesson(card, { format: step.format, cards }) : generate(card, { cards });
        $('counter').textContent = `${index + 1} / ${total}`;
        $('progress').style.width = `${(100 * index) / total}%`;
        $('consigne').textContent = ex.consigne;
        $('feedback').replaceChildren();
        let answer;
        if (isLearn(card)) answer = await playLesson(ex, lessonUi());
        else { const r = await playExisting(ex); answer = { result: r.correctFirstTry ? 'right' : 'miss', ms: r.ms, typed: '' }; }
        if (!running) return;
        history.push({ cardId: card.id, recorded: step.record });
        items.push({ cardId: card.id, type: ex.type, correctFirstTry: answer.result === 'right', result: answer.result, attempts: 1, ms: answer.ms, typed: answer.typed, recorded: step.record });
        if (!step.record) continue;
        const out = applyStep({ learn, srs, step, ...answer, today: day, hasVoice: voice });
        ({ learn, srs } = out);
        owed = afterAnswer({ owed, cardId: card.id, index, learning: out.learning });
        persist(() => { saveLearn(sessionProfileId, TRACK, learn); saveSrs(sessionProfileId, TRACK, srs); });
    }
    running = false;
    if (!items.length) { show('home'); renderHome(); return; }
    persist(() => appendSession(sessionProfileId, TRACK, { date: new Date().toISOString(), items, durationMs: Date.now() - t0, lesson: lessonId }));
    renderDone(items);
}

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
        // A lesson's written items join the daily session only once learnt (they then have a Leitner state).
        const card = nextCard({ srs, cards: cards.filter(c => !isLearn(c) || srs.cards[c.id]), played, today: day });
        if (!card) break;
        played.add(card.id);
        $('counter').textContent = `${i + 1} / ${n}`;
        $('progress').style.width = `${(100 * i) / n}%`;
        $('feedback').replaceChildren();
        if (isLearn(card)) {
            // Reviewed in its top-level format; the ladder state follows (a miss sends it back to the lesson session).
            const level = topLevel(card.kind, hasVoice());
            const step = { card, level, format: FORMATS[card.kind][level][0], record: true };
            const ex = generateLesson(card, { format: step.format, cards });
            $('consigne').textContent = ex.consigne;
            const answer = await playLesson(ex, lessonUi());
            if (!running) return;
            const out = applyStep({ learn: loadLearn(sessionProfileId, TRACK), srs, step, ...answer, today: day, hasVoice: hasVoice() });
            srs = out.srs;
            items.push({ cardId: card.id, type: ex.type, correctFirstTry: answer.result === 'right', result: answer.result, attempts: 1, ms: answer.ms, typed: answer.typed });
            persist(() => { saveLearn(sessionProfileId, TRACK, out.learn); saveSrs(sessionProfileId, TRACK, srs); });
            continue;
        }
        const ex = generate(card, { cards });
        $('consigne').textContent = ex.consigne;
        const result = await playExisting(ex);
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
    // A lesson item put right on the second try ("presque") is not a miss.
    const misses = [...new Map(items.filter(x => (x.result ? x.result === 'miss' : !x.correctFirstTry)).map(x => {
        const c = cards.find(k => k.id === x.cardId);
        return [`${c.deckId}/${c.item.id}`, resolveItem(c.item)];
    })).values()];
    $('rework').replaceChildren(...(misses.length ? [
        el('h2', { class: 'h5' }, 'À retravailler'),
        el('ul', { class: 'en-done-list' }, ...misses.map(it => el('li', {}, el('span', {}, it.fr ?? it.cue ?? ''), el('b', { lang: 'en' }, it.en[0])))),
    ] : [el('p', { class: 'en-note' }, 'Tout juste du premier coup !')]));
    if (right === items.length) celebrate({ duration: 3000, pieces: 80 });
    say(right === items.length ? 'Perfect! Well done!' : 'Well done!');
}

// lessonId: a lesson session; none: the daily session. "Encore une séance" repeats the kind just played.
let lastLesson = null;
function start(lessonId = null) {
    if (running) return;
    lastLesson = lessonId;
    $('play').disabled = true;
    // iOS: the first utterance must start inside the tap.
    try { globalThis.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
    (lessonId ? runLessonSession(lessonId) : runSession()).catch(err => { console.error(err); running = false; show('home'); renderHome(); })
        .finally(() => { $('play').disabled = false; });
}
$('play').addEventListener('click', () => start());
$('again').addEventListener('click', () => start(lastLesson));

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
