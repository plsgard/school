// assets/agent/locks.js
// One lock panel = one exercise, resolving { result: 'right' | 'retry' | 'miss', ms, typed }. The written formats of the
// English lessons (pick, pick2, fill, tiles, type, cover, hear) are played by assets/en/lesson-play.js unchanged; the
// other formats have their panels here, with the same contract: a near miss gets one more try, a miss always ends on
// the model answer (typed formats then have him copy it once, unscored), nothing is timed, nothing blocks.
// The hint drone shows the first letter or removes two wrong choices, and caps the result at 'retry'.
import { playLesson, almostMessage, markDiff } from '../en/lesson-play.js';
import { checkCloze, checkSentence } from '../lessons/qa.js';

const NBSP = ' ';
const LESSON_FORMATS = ['pick', 'pick2', 'fill', 'tiles', 'type', 'cover', 'hear'];

const inputAttrs = (label) => ({
    type: 'text', class: 'en-input', 'aria-label': label,
    autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'done',
});

function continueButton(ui, label = 'Continuer ▶') {
    return new Promise(resolve => {
        const b = ui.el('button', { type: 'button', class: 'en-cta', onclick: () => resolve() }, label);
        ui.feedback.append(b);
        b.focus({ preventScroll: true });
    });
}

function modelLine(ui, model, typed) {
    const [pre, mid, post] = markDiff(model, typed ?? '');
    return ui.el('div', { class: 'answer' }, pre, mid ? ui.el('mark', {}, mid) : null, post);
}

// gap-pick (grammar) and listen-pick (vocab): the first tap decides.
function playChoice(ex, ui) {
    const { el } = ui;
    const t0 = Date.now();
    const listen = ex.type === 'listen-pick';
    return new Promise(resolve => {
        const grid = el('div', { class: 'en-choices' }, ...ex.choices.map(c => el('button', {
            type: 'button', class: 'en-choice', 'data-correct': c.correct ? '1' : '0',
            onclick: async (e) => {
                if (Date.now() - t0 < 400) return;
                const ms = Date.now() - t0;
                for (const b of grid.querySelectorAll('button')) b.disabled = true;
                grid.querySelector('[data-correct="1"]').classList.add('ok');
                const shown = listen ? `${ex.answer.en} = ${ex.answer.fr}` : ex.filled;
                if (c.correct) {
                    ui.feedback.replaceChildren(el('strong', {}, `✅ Oui${NBSP}!`), el('div', { class: 'answer', lang: 'en' }, shown));
                    await ui.say(ex.say);
                    await ui.sleep(450);
                    resolve({ result: 'right', ms, typed: '' });
                    return;
                }
                e.currentTarget.classList.add('ko');
                ui.feedback.replaceChildren(el('strong', {}, `❌ La bonne réponse${NBSP}:`), el('div', { class: 'answer', lang: 'en' }, shown));
                await ui.say(ex.say);
                await continueButton(ui);
                resolve({ result: 'miss', ms, typed: c.text ?? c.fr ?? '' });
            },
        }, listen && c.img ? el('span', { class: 'img' }, c.img) : null, listen ? c.fr : c.text)));
        if (listen) {
            const replay = el('button', { type: 'button', class: 'en-speak', 'aria-label': 'Réécouter', onclick: () => ui.say(ex.say) }, '🔊');
            ui.stage.replaceChildren(replay, grid);
            setTimeout(() => ui.say(ex.say), 300);
        } else {
            ui.stage.replaceChildren(el('div', { class: 'en-prompt' }, el('div', { class: 'fr', lang: 'en' }, ex.gap), ex.fr ? el('div', { class: 'en-note' }, ex.fr) : null), grid);
        }
    });
}

// Typed answers with one more try on a near miss; check(typed) → 'right' | 'almost' | 'wrong' (+ message).
async function typedLoop(ui, input, form, check) {
    const t0 = Date.now();
    let ms = 0, tries = 0, first = '';
    input.focus({ preventScroll: true });
    return new Promise(resolve => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const typed = input.value;
            if (!typed.trim()) return;
            if (!tries) { ms = Date.now() - t0; first = typed; }
            tries++;
            const r = check(typed);
            if (r.outcome === 'right') { resolve({ result: tries === 1 ? 'right' : 'retry', typed: tries === 1 ? '' : first, ms }); return; }
            if (r.outcome === 'almost' && tries === 1) {
                ui.feedback.replaceChildren(ui.el('span', {}, r.message));
                input.focus({ preventScroll: true });
                return;
            }
            resolve({ result: 'miss', typed, ms });
        });
    });
}

// He copies the model once (not scored) before the way opens.
function copyOnce(ui, label, accept) {
    const { el } = ui;
    const copy = el(label.long ? 'textarea' : 'input', { ...inputAttrs('Recopie la bonne réponse'), rows: 3 });
    const form = el('form', { class: 'en-typed', novalidate: true }, copy, el('button', { type: 'submit', class: 'en-cta' }, 'Continuer ▶'));
    ui.feedback.append(el('span', { class: 'en-note' }, label.text), form);
    copy.focus({ preventScroll: true });
    return new Promise(resolve => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (accept(copy.value)) { resolve(); return; }
            copy.classList.remove('ko');
            void copy.offsetWidth;
            copy.classList.add('ko');
        });
    });
}

// qa level 2: the model answer with one key word to type.
async function playCloze(ex, ui) {
    const { el } = ui;
    const input = el('input', { ...inputAttrs('Le mot qui manque'), style: 'width: 12em; display: inline-block' });
    const form = el('form', { class: 'en-typed', novalidate: true },
        el('div', { class: 'ag-cloze' }, ex.cloze.before, input, ex.cloze.after),
        el('button', { type: 'submit', class: 'en-cta' }, 'Valider'));
    ui.stage.replaceChildren(el('div', { class: 'en-prompt' }, el('div', { class: 'fr' }, ex.cue)), form);
    const answer = await typedLoop(ui, input, form, (typed) => {
        const outcome = checkCloze(ex.cloze.answer, typed);
        return { outcome, message: almostMessage(['spelling']) };
    });
    input.disabled = true;
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    if (answer.result !== 'miss') {
        ui.feedback.replaceChildren(el('strong', {}, answer.result === 'right' ? `✅ Oui${NBSP}!` : `✅ C’est ça${NBSP}!`), el('div', { class: 'answer' }, ex.model));
        await ui.sleep(900);
        return answer;
    }
    ui.feedback.replaceChildren(el('strong', {}, `❌ Le mot était${NBSP}:`), modelLine(ui, ex.cloze.answer, answer.typed), el('div', { class: 'en-note' }, ex.model));
    await copyOnce(ui, { text: 'Recopie le mot pour continuer.' }, (v) => checkCloze(ex.cloze.answer, v) === 'right');
    return answer;
}

// qa level 3: his own sentence, right when every key idea is in it. "Presque" says how many ideas are missing,
// never which. The model answer is shown after every outcome.
async function playSentence(ex, ui) {
    const { el } = ui;
    const input = el('textarea', { ...inputAttrs('Ta réponse'), rows: 3 });
    const form = el('form', { class: 'en-typed', novalidate: true }, input, el('button', { type: 'submit', class: 'en-cta' }, 'Valider'));
    ui.stage.replaceChildren(el('div', { class: 'en-prompt' }, el('div', { class: 'fr' }, ex.cue)), form);
    const answer = await typedLoop(ui, input, form, (typed) => {
        const r = checkSentence(ex.keys, typed);
        const n = r.missing;
        return { outcome: r.outcome, message: `Presque${NBSP}! Il manque ${n === 1 ? 'une idée' : `${n} idées`}. Complète ta phrase.` };
    });
    input.disabled = true;
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    if (answer.result !== 'miss') {
        ui.feedback.replaceChildren(el('strong', {}, answer.result === 'right' ? `✅ Bien répondu${NBSP}!` : `✅ C’est ça${NBSP}!`),
            el('span', { class: 'en-note' }, `La réponse du cours${NBSP}:`), el('div', { class: 'answer' }, ex.model));
        await continueButton(ui);
        return answer;
    }
    ui.feedback.replaceChildren(el('strong', {}, `❌ La réponse du cours${NBSP}:`), el('div', { class: 'answer' }, ex.model));
    await copyOnce(ui, { text: 'Recopie-la pour continuer.', long: true }, (v) => checkSentence(ex.keys, v).outcome === 'right');
    return answer;
}

// The hint drone: two wrong choices go, or the first letter shows. Returns whether something was revealed.
function applyHint(ex, ui) {
    const wrong = [...ui.stage.querySelectorAll('.en-choice[data-correct="0"]:not(:disabled)')];
    if (wrong.length) {
        for (const b of wrong.slice(0, 2)) { b.disabled = true; b.classList.add('gone'); }
        return true;
    }
    const answer = ex.type === 'cloze' ? ex.cloze.answer : ex.model;
    if (!answer) return false;
    const first = answer.trim()[0];
    ui.stage.prepend(ui.el('p', { class: 'ag-hint-line' }, `🛸 Indice${NBSP}: ça commence par « ${first} ».`));
    return true;
}

export function playLock(ex, ui, { hint = null } = {}) {
    let hinted = false;
    if (ui.hintButton) {
        ui.hintButton.hidden = !hint;
        ui.hintButton.disabled = false;
        ui.hintButton.onclick = () => {
            if (hinted || !hint || !hint()) return;
            if (applyHint(ex, ui)) hinted = true;
            ui.hintButton.disabled = true;
        };
    }
    let play;
    if (LESSON_FORMATS.includes(ex.type)) {
        play = playLesson(ex, ui);
        // Long answers (other subjects) read better one per line.
        const grid = ui.stage.querySelector('.en-choices');
        if (grid && ex.choices?.some(c => c.text.length > 28)) grid.classList.add('long');
    } else if (ex.type === 'gap-pick' || ex.type === 'listen-pick') play = playChoice(ex, ui);
    else if (ex.type === 'cloze') play = playCloze(ex, ui);
    else if (ex.type === 'sentence') play = playSentence(ex, ui);
    else throw new Error(`no lock panel for ${ex.type}`);
    return play.then(r => {
        if (ui.hintButton) { ui.hintButton.hidden = true; ui.hintButton.onclick = null; }
        return { ...r, result: hinted && r.result === 'right' ? 'retry' : r.result };
    });
}
