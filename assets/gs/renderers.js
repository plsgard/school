// assets/gs/renderers.js
// Exercise → DOM. One renderer per layout (tap, multitap, dots, slots, trace).
// renderExercise resolves once the success cue has finished playing (and, when waitForTap is set, after the
// adult tapped "Suivant"), with { correctFirstTry, attempts, ms }.
// Misses (R5): a wrong tap, a wrong dots confirm, a wrong slot tile, a failed trace that came with a hint.
// correctFirstTry = misses === 0; attempts = misses + 1. The second miss reveals the answer (except in parent mode).
// Every text that comes from data goes through textContent, never innerHTML.
import { mountTrace } from './trace.js';
import { adultHint } from './rules.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HIDE_MS = 3000;          // a wrong choice hides for a few seconds
const LONG_PRESS_MS = 450;     // long-press on a choice speaks its `say`

// Fixed UI cues: each key has exactly one text (Task 13 records one clip per key).
export const UI_CUES = {
    tryAgain: { key: 'ui.try-again', text: 'Essaie encore.' },
    notThatOne: { key: 'ui.not-that-one', text: 'Pas celle-là.' },
    missing: { key: 'ui.missing', text: 'Il en manque.' },
    tooMany: { key: 'ui.too-many', text: 'Il y en a trop.' },
    dotsConfirm: { key: 'ui.dots-confirm', text: 'Appuie sur le bouton vert quand c\'est fini.' },
    restart: { key: 'ui.restart', text: 'Recommencer.' },
    nextHint: { key: 'ui.next-hint', text: 'Appuie sur la flèche pour continuer.' },
    more: {
        1: { key: 'ui.more.1', text: 'Encore une !' },
        2: { key: 'ui.more.2', text: 'Encore deux !' },
        3: { key: 'ui.more.3', text: 'Encore trois !' },
    },
    traceHint: {
        start: { key: 'ui.trace-hint.start', text: 'Pars du point vert.' },
        follow: { key: 'ui.trace-hint.follow', text: 'Suis le chemin gris.' },
        inside: { key: 'ui.trace-hint.inside', text: 'Presque ! Reste dans le chemin.' },
    },
};

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function button(cls, text, label) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
}

function renderStage(stage, stageEl) {
    stageEl.replaceChildren();
    if (!stage) return;
    if (stage.emoji) stageEl.append(el('div', '', stage.emoji));
    else if (stage.text) stageEl.append(el('div', 'gs-sound', stage.text));
    if (stage.tiles) {
        // blend: consonant + vowel tiles
        const row = el('div');
        stage.tiles.forEach((t, i) => { if (i) row.append(el('span', 'plus', '+')); row.append(el('span', 'tile', t)); });
        stageEl.append(row);
    }
    if (stage.collection) {
        const c = el('div', `gs-collection${stage.scattered ? ' scattered' : ''}`);
        for (const e of stage.collection) {
            const s = el('span', '', e);
            if (stage.scattered) {
                s.style.setProperty('--dx', `${(Math.random() - 0.5) * 12}px`);
                s.style.setProperty('--dy', `${(Math.random() - 0.5) * 12}px`);
                s.style.setProperty('--rot', `${(Math.random() - 0.5) * 30}deg`);
            }
            c.append(s);
        }
        stageEl.append(c);
    }
    if (stage.sequence) {
        const q = el('div', 'gs-seq');
        for (const s of stage.sequence) q.append(el('span', s === '?' ? 'blank' : '', s));
        stageEl.append(q);
    }
}

// The generators describe the blend stage as an html snippet of two tiles; rebuild it safely from the text.
function normaliseStage(stage) {
    if (!stage?.html) return stage;
    const tmp = document.createElement('template'); // inert: nothing in it loads or runs
    tmp.innerHTML = stage.html;
    const tiles = [...tmp.content.querySelectorAll('.tile')].map(t => t.textContent);
    const { html: _html, ...rest } = stage;
    return { ...rest, tiles };
}

function choiceButton(c) {
    const b = button(`gs-choice ${c.style ?? ''}`.trim(), null, c.say?.text ?? c.label);
    b.dataset.id = c.id;
    if (c.collection) {
        const coll = el('span', 'coll');
        for (const e of c.collection) coll.append(el('span', '', e));
        b.append(coll);
    } else b.textContent = c.emoji ?? c.label;
    return b;
}

// Long-press speaks `say`; the click that follows the long-press is swallowed. Inert once `isLive()` is false.
function wirePressToSay(btn, say, speak, isLive = () => true) {
    let t = null;
    const clear = () => { clearTimeout(t); t = null; };
    btn.addEventListener('pointerdown', () => {
        delete btn.dataset.held;
        clear();
        if (!isLive()) return;
        t = setTimeout(() => { if (!isLive()) return; btn.dataset.held = '1'; if (say) speak(say); }, LONG_PRESS_MS);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, clear);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
const consumeHeld = (b) => { if (!b.dataset.held) return false; delete b.dataset.held; return true; };

// The exercise currently on screen, so the page can tear it down if the session aborts.
let disposeCurrent = null;
export function disposeExercise() { disposeCurrent?.(); disposeCurrent = null; }

// onSettle(): called once, when the exercise is solved or skipped (the page clears its prompt timer, disables 🔊).
export function renderExercise(root, ex, { speak, parentMode = false, waitForTap = false, onSettle = () => {} }) {
    const { stage, choices, feedback, adult } = root;
    const t0 = Date.now();
    let misses = 0;
    let finished = false;
    const timers = new Set();
    let destroyTrace = null;
    let locked = false; // set by a revealing miss: no tile may come back to life before finish() runs
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
    const cleanup = () => { for (const id of timers) clearTimeout(id); timers.clear(); destroyTrace?.(); destroyTrace = null; };
    disposeExercise();
    disposeCurrent = cleanup;
    const live = () => !finished;
    const hideForAWhile = (b) => { b.style.visibility = 'hidden'; later(() => { b.style.visibility = ''; }, HIDE_MS); };
    renderStage(normaliseStage(ex.stage), stage);
    choices.replaceChildren();
    choices.className = 'gs-choices';
    feedback.replaceChildren();
    // Parent mode (spec §4): the child screen is unchanged, plus one written line for the adult (never spoken).
    if (adult) {
        const hint = parentMode ? adultHint(ex) : null;
        adult.textContent = hint ? `👩‍🏫 ${hint}` : '';
        adult.hidden = !hint;
    }
    // Two-miss rule (spec §7): the second miss reveals the answer. Parent mode never reveals (R22): the adult guides.
    const revealing = () => misses >= 2 && !parentMode;

    return new Promise(resolve => {
        // praise: false = skipped (trace "Suivant" after two misses): no success cue.
        const finish = async ({ praise = true } = {}) => {
            if (finished) return;
            finished = true;
            onSettle();
            onFinish();
            const ms = Date.now() - t0;
            if (praise) {
                feedback.textContent = `⭐ ${ex.success.text}`;
                await speak(ex.success);
                if (waitForTap) {
                    const next = button('gs-cta next', 'Suivant ▶', 'Suivant');
                    feedback.append(next);
                    next.focus({ preventScroll: true });
                    await new Promise(r => next.addEventListener('click', r, { once: true }));
                } else {
                    await sleep(400);
                }
            }
            cleanup();
            if (disposeCurrent === cleanup) disposeCurrent = null;
            resolve({ correctFirstTry: misses === 0, attempts: misses + 1, ms });
        };
        const done = () => finish();
        let onFinish = () => {};

        if (ex.layout === 'tap' || ex.layout === 'multitap') {
            if (ex.choices.length === 2) choices.classList.add('two');
            if (ex.choices.length === 6 && ex.layout === 'tap') choices.classList.add('six'); // six digits; letters stay 3 x 2
            const remaining = new Set(ex.choices.filter(c => c.correct).map(c => c.id));
            const buttons = new Map();
            const markOk = (id) => { const b = buttons.get(id); b.classList.add('ok'); b.disabled = true; remaining.delete(id); };
            for (const c of ex.choices) {
                const b = choiceButton(c);
                buttons.set(c.id, b);
                wirePressToSay(b, c.say, speak, live);
                b.addEventListener('click', async () => {
                    if (consumeHeld(b) || b.disabled || finished) return;
                    if (c.correct) {
                        markOk(c.id);
                        if (remaining.size === 0) { done(); return; }
                        const more = UI_CUES.more[remaining.size];
                        if (more) { feedback.textContent = more.text; speak(more); }
                        return;
                    }
                    misses++;
                    b.classList.add('ko');
                    b.disabled = true;
                    if (revealing()) {
                        // Second miss: no "try again"; lock every tile, show every remaining right answer,
                        // the success cue says it.
                        locked = true;
                        for (const x of buttons.values()) x.disabled = true;
                        for (const id of [...remaining]) markOk(id);
                        await sleep(400);
                        b.classList.remove('ko');
                        b.style.visibility = 'hidden';
                        done();
                        return;
                    }
                    feedback.textContent = UI_CUES.tryAgain.text;
                    speak(ex.layout === 'multitap' && c.say ? c.say : UI_CUES.tryAgain);
                    await sleep(400); // let the shake play, then hide the wrong choice for a few seconds
                    b.classList.remove('ko');
                    if (finished || locked) return;
                    b.disabled = false;
                    hideForAWhile(b);
                });
                choices.append(b);
            }
        }

        if (ex.layout === 'dots') {
            choices.classList.add('stack');
            const dots = el('div', 'gs-dots');
            const all = [];
            const ok = button('gs-cta gs-ok-btn', '✔', 'C\'est bon');
            let nudged = false;
            const nudge = () => {
                // First toggle: show and say where to confirm, once.
                if (nudged) return;
                nudged = true;
                ok.classList.add('pulse');
                speak(UI_CUES.dotsConfirm);
            };
            for (let i = 0; i < ex.total; i++) {
                const fixed = i < ex.lit;
                const d = button(`gs-dot${fixed ? ' on fixed' : ''}`, null, fixed ? 'Rond déjà allumé' : 'Rond à allumer');
                d.setAttribute('aria-pressed', String(fixed));
                if (fixed) d.disabled = true;
                else d.addEventListener('click', () => {
                    if (finished) return;
                    d.classList.toggle('on');
                    d.setAttribute('aria-pressed', String(d.classList.contains('on')));
                    nudge();
                });
                dots.append(d); all.push(d);
            }
            ok.addEventListener('click', async () => {
                if (finished || ok.disabled) return;
                ok.classList.remove('pulse');
                const n = dots.querySelectorAll('.on').length;
                if (n === ex.target) { ok.disabled = true; done(); return; }
                misses++;
                if (revealing()) {
                    all.forEach((d, i) => { d.classList.toggle('on', i < ex.target); d.disabled = true; });
                    ok.disabled = true;
                    done();
                    return;
                }
                const cueMsg = n < ex.target ? UI_CUES.missing : UI_CUES.tooMany;
                feedback.textContent = cueMsg.text;
                ok.disabled = true;
                await speak(cueMsg);
                if (!finished) ok.disabled = false;
            });
            choices.append(dots, ok);
        }

        if (ex.layout === 'slots') {
            choices.classList.add('stack');
            const slots = el('div', 'gs-slots');
            const pool = el('div', 'gs-choices');
            const want = [...ex.answer];
            let typed = 0;
            want.forEach(() => slots.append(el('span')));
            const tiles = [];
            const place = (b, label) => {
                b.style.visibility = 'hidden'; b.disabled = true;
                const s = slots.children[typed];
                s.textContent = label; s.classList.add('filled');
                typed++;
            };
            for (const c of ex.choices) {
                const b = choiceButton(c);
                b.dataset.label = c.label;
                tiles.push(b);
                wirePressToSay(b, c.say, speak, live);
                b.addEventListener('click', async () => {
                    if (consumeHeld(b) || b.disabled || finished) return;
                    if (want[typed] === c.label) {
                        place(b, c.label);
                        if (typed === want.length) { done(); return; }
                        if (c.say) speak(c.say);
                        return;
                    }
                    misses++;
                    b.classList.add('ko'); b.disabled = true;
                    if (revealing()) {
                        // Second miss: the remaining letters go in, in order, then the name is said.
                        await sleep(400);
                        b.classList.remove('ko'); b.disabled = false;
                        while (typed < want.length) {
                            const tile = tiles.find(t => !t.disabled && t.style.visibility !== 'hidden' && t.dataset.label === want[typed]);
                            if (!tile) break;
                            place(tile, want[typed]);
                        }
                        done();
                        return;
                    }
                    feedback.textContent = UI_CUES.notThatOne.text;
                    await speak(UI_CUES.notThatOne);
                    b.classList.remove('ko'); b.disabled = false;
                });
                pool.append(b);
            }
            choices.append(slots, pool);
        }

        if (ex.layout === 'trace') {
            choices.classList.add('stack');
            const box = el('div', 'gs-trace');
            box.setAttribute('role', 'img');
            box.setAttribute('aria-label', ex.prompt?.text ?? 'Trace la lettre');
            const bar = el('div', 'gs-trace-bar');
            const resetBtn = button('gs-icon', '↺', 'Recommencer');
            wirePressToSay(resetBtn, UI_CUES.restart, speak, live);
            bar.append(resetBtn);
            choices.append(box, bar);
            let skip = null;
            const t = mountTrace(box, ex.trace, {
                onResult: (r) => {
                    if (finished) return;
                    if (r.ok) { done(); return; }
                    if (!r.hint) return; // a too-short stroke (a tap) is not a miss
                    misses++;
                    const hint = UI_CUES.traceHint[r.hintKey];
                    feedback.textContent = hint?.text ?? r.hint;
                    if (revealing() && !skip) {
                        // Second miss: say the letter, offer a way out; the canvas stays live for one more try.
                        const said = speak(ex.trace.say ?? hint ?? { text: r.hint });
                        skip = button('gs-cta next pulse', 'Suivant ▶', 'Suivant');
                        skip.addEventListener('click', () => finish({ praise: false }), { once: true });
                        bar.append(skip);
                        onFinish = () => { skip.remove(); }; // never two "Suivant" at once (praise adds its own)
                        said.then(() => { if (!finished) speak(UI_CUES.nextHint); }); // once, after the letter name
                        return;
                    }
                    speak(hint ?? { text: r.hint });
                },
            });
            resetBtn.addEventListener('click', () => {
                if (consumeHeld(resetBtn) || finished) return;
                t.reset(); feedback.replaceChildren();
            });
            destroyTrace = () => t.destroy();
        }
    });
}
