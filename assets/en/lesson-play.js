// assets/en/lesson-play.js
// Renders one written exercise of a lesson (lesson-generators.js) and resolves with
// { result: 'right' | 'retry' | 'miss', ms, typed }. 'retry' = a near miss ("presque") put right on the second try.
// A miss always ends on the model answer; typed formats then ask to copy it once (not scored). Never blocks.
import { checkAnswer } from './answer.js';
import { joinTiles } from './lesson-generators.js';

const NBSP = ' ';

// Pure: why an answer was only "almost" right, in the child's words.
export function almostMessage(reasons) {
    const c = reasons.includes('case'), p = reasons.includes('punct');
    if (c && p) return `Presque${NBSP}! Attention aux majuscules et à la ponctuation.`;
    if (c) return `Presque${NBSP}! Attention aux majuscules.`;
    if (p) return `Presque${NBSP}! Attention à la ponctuation (virgule, point…).`;
    return `Presque${NBSP}! Regarde bien l’orthographe.`;
}

// Pure: the model split around the part that differs from what was typed → [same, different, same].
export function markDiff(model, typed) {
    const t = String(typed ?? '');
    let a = 0;
    while (a < model.length && a < t.length && model[a] === t[a]) a++;
    let b = 0;
    while (b < model.length - a && b < t.length - a && model[model.length - 1 - b] === t[t.length - 1 - b]) b++;
    return [model.slice(0, a), model.slice(a, model.length - b), model.slice(model.length - b)];
}

// ui: { stage, feedback, say(text), el(tag, attrs, ...children), sleep(ms) }
export function playLesson(ex, ui) {
    if (ex.type === 'pick' || ex.type === 'pick2') return playPick(ex, ui);
    if (ex.type === 'tiles') return playTiles(ex, ui);
    return playTyped(ex, ui);
}

// replaceChildren would print a missing (null) child as the text "null".
const put = (node, ...children) => node.replaceChildren(...children.filter(c => c != null));

function cueBlock(ex, { el }) {
    if (!ex.cue) return null;
    return el('div', { class: 'en-prompt' },
        el('div', { class: 'fr' }, ex.cue),
        // What to write (a day, a date…), only where he writes it himself and the instruction does not say it already.
        ['fill', 'cover'].includes(ex.type) && ex.hint ? el('div', { class: 'en-note' }, ex.hint) : null);
}

function modelLine(ex, typed, { el }) {
    const [pre, mid, post] = markDiff(ex.model, typed);
    return el('div', { class: 'answer', lang: 'en' }, pre, mid ? el('mark', {}, mid) : null, post);
}

function textInput({ el }, label) {
    return el('input', {
        type: 'text', class: 'form-control en-input', lang: 'en', 'aria-label': label,
        autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'done',
    });
}

async function rightEnd(ex, ui, label) {
    ui.feedback.replaceChildren(ui.el('strong', {}, label), ui.el('div', { class: 'answer', lang: 'en' }, ex.model));
    await ui.say(ex.say);
    await ui.sleep(450);
}

function continueButton(ui, label = 'Continuer ▶') {
    return new Promise(resolve => {
        const b = ui.el('button', { type: 'button', class: 'en-cta primary', onclick: () => resolve() }, label);
        ui.feedback.append(b);
        b.focus();
    });
}

function playPick(ex, ui) {
    const { el } = ui;
    const t0 = Date.now();
    return new Promise(resolve => {
        const grid = el('div', { class: 'en-choices' }, ...ex.choices.map(c => el('button', {
            type: 'button', class: 'en-choice', lang: 'en', 'data-correct': c.correct ? '1' : '0',
            onclick: async (e) => {
                if (Date.now() - t0 < 400) return; // the ▶ double tap must not answer blind
                const ms = Date.now() - t0;
                for (const b of grid.querySelectorAll('button')) b.disabled = true;
                grid.querySelector('[data-correct="1"]').classList.add('ok');
                if (c.correct) {
                    await rightEnd(ex, ui, `✅ Oui${NBSP}!`);
                    resolve({ result: 'right', ms, typed: '' });
                    return;
                }
                e.currentTarget.classList.add('ko');
                ui.feedback.replaceChildren(el('strong', {}, `❌ La bonne écriture${NBSP}:`), modelLine(ex, c.text, ui));
                await ui.say(ex.say);
                await continueButton(ui);
                resolve({ result: 'miss', ms, typed: c.text });
            },
        }, c.text)));
        put(ui.stage, cueBlock(ex, ui), grid);
    });
}

function playTiles(ex, ui) {
    const { el } = ui;
    const t0 = Date.now();
    return new Promise(resolve => {
        const placed = []; // indexes into ex.tiles, in the order tapped
        const line = el('div', { class: 'en-built', lang: 'en', 'aria-label': 'Ta réponse' });
        const bank = el('div', { class: 'en-tiles' });
        const check = el('button', { type: 'button', class: 'en-cta primary', disabled: true }, 'Valider');
        const render = () => {
            put(line, ex.prefix ? el('span', { class: 'en-prefix' }, ex.prefix) : null,
                ...placed.map((i, pos) => el('button', { type: 'button', class: 'en-tile placed', onclick: () => { placed.splice(pos, 1); render(); } }, ex.tiles[i])));
            bank.replaceChildren(...ex.tiles.map((t, i) => el('button', {
                type: 'button', class: 'en-tile', disabled: placed.includes(i), onclick: () => { placed.push(i); render(); },
            }, t)));
            check.disabled = placed.length !== ex.tiles.length;
        };
        check.onclick = async () => {
            const ms = Date.now() - t0;
            const built = joinTiles(ex.kind, ex.prefix, placed.map(i => ex.tiles[i]));
            check.disabled = true;
            for (const b of [...bank.querySelectorAll('button'), ...line.querySelectorAll('button')]) b.disabled = true;
            if (built === ex.model) {
                await rightEnd(ex, ui, `✅ Oui${NBSP}!`);
                resolve({ result: 'right', ms, typed: '' });
                return;
            }
            ui.feedback.replaceChildren(el('strong', {}, `❌ La bonne réponse${NBSP}:`), modelLine(ex, built, ui));
            await ui.say(ex.say);
            await continueButton(ui);
            resolve({ result: 'miss', ms, typed: built });
        };
        render();
        put(ui.stage, cueBlock(ex, ui), line, bank, check);
    });
}

async function playTyped(ex, ui) {
    const { el } = ui;
    const input = textInput(ui, 'Ta réponse en anglais');
    const send = el('button', { type: 'button', class: 'en-cta primary' }, 'Valider');
    const replay = ex.type === 'hear' ? el('button', { type: 'button', class: 'en-speak', 'aria-label': 'Réécouter', onclick: () => ui.say(ex.say) }, '🔊') : null;
    const form = el('form', { class: 'en-typed', novalidate: true }, input, send);

    if (ex.type === 'cover') {
        // Look, cover, write: the model is shown a few seconds, then hidden.
        const shown = el('div', { class: 'en-line en-cover', lang: 'en' }, ex.model);
        put(ui.stage, cueBlock(ex, ui), shown);
        ui.feedback.replaceChildren(el('span', {}, 'Regarde bien…'));
        await ui.sleep(ex.showMs);
        ui.feedback.replaceChildren();
        put(ui.stage, cueBlock(ex, ui), form);
    } else {
        put(ui.stage, cueBlock(ex, ui), replay,
            ex.type === 'fill' ? el('div', { class: 'en-pattern', lang: 'en', 'aria-label': 'Mot à compléter' }, ex.pattern) : null, form);
        if (ex.type === 'hear') setTimeout(() => ui.say(ex.say), 350);
    }
    input.focus({ preventScroll: true });

    const t0 = Date.now();
    let ms = 0;
    let tries = 0;
    const answer = await new Promise(resolve => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const typed = input.value;
            if (!typed.trim()) return;
            if (!tries) ms = Date.now() - t0;
            tries++;
            const r = checkAnswer(ex.accepted, typed, ex.strict, ex.confusables);
            if (r.outcome === 'right') { resolve({ result: tries === 1 ? 'right' : 'retry', typed: '' }); return; }
            if (r.outcome === 'almost' && tries === 1) {
                ui.feedback.replaceChildren(el('span', {}, almostMessage(r.reasons)));
                input.focus({ preventScroll: true });
                return;
            }
            resolve({ result: 'miss', typed });
        });
    });
    input.disabled = true; send.disabled = true;
    if (replay) replay.disabled = true;
    if (answer.result !== 'miss') {
        await rightEnd(ex, ui, answer.result === 'right' ? `✅ Oui${NBSP}!` : `✅ C’est ça${NBSP}!`);
        return { ...answer, ms };
    }

    // The right answer, with what differs marked; then he copies it once before going on.
    const copy = textInput(ui, 'Recopie la bonne réponse');
    const copyForm = el('form', { class: 'en-typed', novalidate: true }, copy,
        el('button', { type: 'submit', class: 'en-cta primary' }, 'Continuer ▶'));
    ui.feedback.replaceChildren(el('strong', {}, `❌ La bonne réponse${NBSP}:`), modelLine(ex, answer.typed, ui),
        el('span', { class: 'en-note' }, 'Recopie-la pour continuer.'), copyForm);
    ui.say(ex.say);
    copy.focus({ preventScroll: true });
    await new Promise(resolve => {
        copyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (checkAnswer([ex.model], copy.value, { case: true, punct: true, spelling: true }).outcome === 'right') { resolve(); return; }
            copy.classList.remove('ko');
            void copy.offsetWidth; // restart the shake
            copy.classList.add('ko');
        });
    });
    return { ...answer, ms };
}
