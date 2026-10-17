// assets/gs/renderers.js
// Exercise → DOM. One renderer per layout (tap, multitap, select, dots, slots, trace).
// renderExercise resolves once the success cue has finished playing (and, when waitForTap is set, after the
// adult tapped "Suivant"), with { correctFirstTry, attempts, ms }.
// Misses (R5): a wrong tap, a wrong dots confirm, a wrong slot tile, a failed trace that came with a hint.
// correctFirstTry = misses === 0; attempts = misses + 1. The second miss reveals the answer (except in parent mode);
// a revealed answer is never praised: "Regarde." then the answer is said (M3).
// Shown texts use a cue's `display` when it has one (letters written, not named), spoken ones its `text` (I6).
// Every text that comes from data goes through textContent, never innerHTML.
import { mountTrace } from './trace.js';
import { adultHint } from './rules.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HIDE_MS = 3000;          // a wrong choice hides for a few seconds
const LONG_PRESS_MS = 450;     // long-press on a choice speaks its `say`

// Fixed UI cues: each key has exactly one text (Task 13 records one clip per key).
export const UI_CUES = {
    tryAgain: { key: 'ui.try-again', text: 'Essaie encore.' },
    notThatOne: { key: 'ui.not-that-one', text: 'Pas cette lettre-là.' },
    missing: { key: 'ui.missing', text: 'Il manque des ronds.' },
    tooMany: { key: 'ui.too-many', text: 'Il y a trop de ronds.' },
    dotsConfirm: { key: 'ui.dots-confirm', text: 'Appuie sur le bouton vert quand c\'est fini.' },
    blendConfirm: { key: 'ui.blend-confirm', text: 'Écoute, puis appuie sur le bouton vert.' },
    look: { key: 'ui.look', text: 'Regarde.' },
    restart: { key: 'ui.restart', text: 'Recommencer.' },
    nextHint: { key: 'ui.next-hint', text: 'Appuie sur la flèche pour continuer.' },
    more: {
        1: { key: 'ui.more.1', text: 'Encore une lettre !' },
        2: { key: 'ui.more.2', text: 'Encore deux lettres !' },
        3: { key: 'ui.more.3', text: 'Encore trois lettres !' },
    },
    traceHint: {
        start: { key: 'ui.trace-hint.start', text: 'Pars du point vert.' },
        follow: { key: 'ui.trace-hint.follow', text: 'Suis le chemin gris.' },
        inside: { key: 'ui.trace-hint.inside', text: 'Presque ! Reste dans le chemin.' },
        arrows: { key: 'ui.trace-hint.arrows', text: 'Suis les flèches.' },
        blue: { key: 'ui.trace-blue', text: 'Maintenant, pars du point bleu !' }, // also said when stroke 1 is done
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

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }; // 3 x 3 grid, row-major
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
    if (stage.dice) {
        const row = el('div', 'gs-dice');
        row.setAttribute('role', 'img');
        row.setAttribute('aria-label', stage.dice.length === 2 ? 'Deux dés' : 'Dé'); // never the count: it is the answer
        for (const f of stage.dice) {
            const die = el('div', 'gs-die');
            for (let i = 0; i < 9; i++) die.append(el('span', PIPS[f].includes(i) ? 'pip' : ''));
            row.append(die);
        }
        stageEl.append(row);
    }
    if (stage.groups) {
        const row = el('div', 'gs-groups');
        stage.groups.forEach((g, i) => {
            if (i) row.append(el('span', 'plus', '+'));
            const c = el('div', 'gs-collection');
            for (const e of g) c.append(el('span', '', e));
            row.append(c);
        });
        stageEl.append(row);
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
    const b = button(`gs-choice ${c.style ?? ''}${c.collection ? ' with-coll' : ''}`.trim(), null, c.say?.text ?? c.label);
    b.dataset.id = c.id;
    if (c.collection) {
        // Spec §7 compare: the collection, and its digit under it (M1).
        const coll = el('span', 'coll');
        for (const e of c.collection) coll.append(el('span', '', e));
        b.append(coll, el('span', 'coll-digit', c.label));
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

    // What is said after "Regarde." when the answer is revealed: the right choice, or the name spelled for slots.
    const answerSay = () => ex.reveal ?? (ex.layout === 'slots' ? ex.success : ex.choices?.find(c => c.correct)?.say ?? null);
    // P4: a miss's async continuation (after its cue or its shake) must never write over the reveal or the praise.
    const tell = (text) => { if (!finished && !locked) feedback.textContent = text; };

    return new Promise(resolve => {
        // praise: false = skipped (trace "Suivant" after two misses): no success cue.
        // revealed: true = the second miss showed the answer: a neutral "Regarde." and the answer, never a "Bravo".
        const finish = async ({ praise = true, revealed = false } = {}) => {
            if (finished) return;
            finished = true;
            locked = true;
            onSettle();
            onFinish();
            const ms = Date.now() - t0;
            if (revealed) {
                feedback.textContent = `👀 ${UI_CUES.look.text}`;
                await speak(UI_CUES.look);
                const say = answerSay();
                if (say) await speak(say);
            } else if (praise) {
                feedback.textContent = `⭐ ${ex.success.display ?? ex.success.text}`;
                await speak(ex.success);
            }
            if (praise || revealed) {
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
        const reveal = () => finish({ revealed: true });
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
                        if (more) { tell(more.text); speak(more); }
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
                        reveal();
                        return;
                    }
                    tell(UI_CUES.tryAgain.text);
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

        if (ex.layout === 'select') {
            // R27 (blend): a tap plays the syllable and selects it; the green ✔ confirms. Misses count on ✔.
            choices.classList.add('stack');
            const row = el('div', 'gs-choices');
            const ok = button('gs-cta gs-ok-btn', '✔', 'C\'est bon');
            ok.disabled = true;
            const buttons = new Map();
            let selected = null;
            let nudged = false;
            const select = (c) => {
                selected = c;
                for (const [id, x] of buttons) {
                    x.classList.toggle('selected', id === c?.id);
                    x.setAttribute('aria-pressed', String(id === c?.id));
                }
                ok.disabled = !c;
            };
            for (const c of ex.choices) {
                const b = choiceButton(c);
                b.setAttribute('aria-pressed', 'false');
                buttons.set(c.id, b);
                b.addEventListener('click', () => {
                    if (finished || locked || b.disabled) return;
                    select(c);
                    const said = speak(c.say);
                    if (nudged) return;
                    nudged = true; // first selection: once the syllable is heard, say where to confirm
                    said.then(() => { if (!finished && !locked) { ok.classList.add('pulse'); speak(UI_CUES.blendConfirm); } });
                });
                row.append(b);
            }
            ok.addEventListener('click', async () => {
                if (finished || locked || ok.disabled || !selected) return;
                ok.classList.remove('pulse');
                const b = buttons.get(selected.id);
                if (selected.correct) { b.classList.add('ok'); ok.disabled = true; locked = true; done(); return; }
                misses++;
                b.classList.add('ko');
                if (revealing()) {
                    locked = true;
                    for (const x of buttons.values()) x.disabled = true;
                    b.classList.remove('selected'); // only the right answer stays highlighted
                    ok.disabled = true;
                    buttons.get(ex.choices.find(c => c.correct).id).classList.add('ok');
                    await sleep(400);
                    b.classList.remove('ko');
                    reveal();
                    return;
                }
                ok.disabled = true;
                const wrong = selected;
                tell(UI_CUES.tryAgain.text);
                await speak(UI_CUES.tryAgain);
                b.classList.remove('ko');
                if (!finished && !locked && selected === wrong) select(null); // keep a tile picked while the cue played
            });
            choices.append(row, ok);
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
                    reveal();
                    return;
                }
                const cueMsg = n < ex.target ? UI_CUES.missing : UI_CUES.tooMany;
                tell(cueMsg.text);
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
                    if (consumeHeld(b) || b.disabled || finished || locked) return;
                    if (want[typed] === c.label) {
                        place(b, c.label);
                        if (typed === want.length) { done(); return; }
                        if (c.say) speak(c.say);
                        return;
                    }
                    misses++;
                    b.classList.add('ko'); b.disabled = true;
                    if (revealing()) {
                        // Second miss: lock every tile first (M5), then the remaining letters go in, in order, and the
                        // name is said. Placed tiles are hidden, so a visible tile is still free.
                        locked = true;
                        for (const t of tiles) t.disabled = true;
                        await sleep(400);
                        b.classList.remove('ko');
                        while (typed < want.length) {
                            const tile = tiles.find(t => t.style.visibility !== 'hidden' && t.dataset.label === want[typed]);
                            if (!tile) break;
                            place(tile, want[typed]);
                        }
                        reveal();
                        return;
                    }
                    tell(UI_CUES.notThatOne.text);
                    await speak(UI_CUES.notThatOne);
                    b.classList.remove('ko');
                    if (!finished && !locked) b.disabled = false;
                });
                pool.append(b);
            }
            choices.append(slots, pool);
        }

        if (ex.layout === 'trace') {
            choices.classList.add('stack');
            const box = el('div', 'gs-trace');
            box.setAttribute('role', 'img');
            box.setAttribute('aria-label', ex.prompt?.display ?? ex.prompt?.text ?? 'Trace la lettre');
            const bar = el('div', 'gs-trace-bar');
            const resetBtn = button('gs-icon', '↺', 'Recommencer');
            wirePressToSay(resetBtn, UI_CUES.restart, speak, live);
            bar.append(resetBtn);
            choices.append(box, bar);
            let skip = null;
            const t = mountTrace(box, ex.trace, {
                onStroke1: () => { if (!finished) { tell(UI_CUES.traceHint.blue.text); speak(UI_CUES.traceHint.blue); } },
                onResult: (r) => {
                    if (finished) return;
                    if (r.ok) { done(); return; }
                    if (!r.hint) return; // a too-short stroke (a tap) is not a miss
                    // Waiting at the blue dot (green stroke done) is not a miss either: no "Suivant" from waiting.
                    // onStroke1 has just said the blue cue. A blue result after a fresh stroke (blueMiss) is a
                    // real miss: it goes on below, says the cue again and can lead to "Suivant".
                    if (r.hintKey === 'blue' && !r.blueMiss) { tell(UI_CUES.traceHint.blue.text); return; }
                    misses++;
                    const hint = UI_CUES.traceHint[r.hintKey];
                    tell(hint?.text ?? r.hint);
                    if (misses >= 2 && !skip) {
                        // Second miss: say the letter, offer a way out (parent mode too, M7: never a praise);
                        // the canvas stays live for one more try.
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
