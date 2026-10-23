// assets/ce2/app.js
// CE2 subtraction track page: home → session of column subtractions (compensation, the class's method) → done,
// parent corner behind ⚙️ (long-press). He reads: written French hints, no speech.
//
// A problem is a grid (one cell per digit) filled from the units leftwards with the on-screen keypad. The marks of the
// method are tappable slots: a small 1 before a top digit (+10) and a small 1 under a bottom digit (+1 carried from
// the column on its right). Guidé checks each column at once; Tout seul checks the whole result. Two wrong checks show
// the worked solution, never praised.
import { getActiveProfileId, setActiveProfileId, loadProfiles, loadSettings, saveSettings, loadSrs, saveSrs, appendSession } from '../storage.js';
import { celebrate } from '../celebration.js';
import { holdToActivate } from '../hold.js';
import { displayName, ensureProfiles, trackProfileId, prefillFirstName } from '../profiles.js';
import { solve, columnHint, digitsOf, COLUMN_NAMES } from './method.js';
import { generate, levelById, LEVELS } from './generators.js';
import { ce2Settings, ladderOf, levelStatus, recordProblem, composeSession, shouldStop, stars, localDay, MASTERY, isUnlocked } from './rules.js';
import { mountParent } from './parent.js';

const NBSP = ' ';
const TRACK = 'ce2';
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('main > .ce2-screen')) s.hidden = s.id !== id; };
const today = () => localDay(new Date());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
    try { write(); } catch (err) { console.warn('[ce2] progress not saved', err); }
}

let profiles = loadProfiles();
persist(() => { profiles = ensureProfiles(); });
const profileId = trackProfileId(profiles, getActiveProfileId(), TRACK);
if (profileId !== getActiveProfileId()) persist(() => setActiveProfileId(profileId));
const stored = profiles.find(p => p.id === profileId);
const profile = stored ?? { id: profileId, name: '', avatar: '🐱' };
let settings = loadSettings(profileId);
persist(() => { if (stored) settings = prefillFirstName(stored); });
// Read on use: the parent corner changes settings without a reload.
const opts = () => ce2Settings(loadSettings(profileId));

const inColumns = (cols) => (cols.length > 1 ? 'dans les colonnes des ' : 'dans la colonne des ') + cols.map(i => COLUMN_NAMES[i]).join(' et des ');

// ---- home ----

// Child-facing level numbers are ranks among the open levels (8 open, 7 locked → « Niveau 7 sur 7 »).
const rankOf = (id) => LEVELS.filter(l => isUnlocked(l.id, opts().unlocked)).findIndex(l => l.id === id) + 1;

function levelLine(srs) {
    const st = levelStatus(srs, opts().unlocked);
    return { ...st, l: levelById(st.level) };
}

function renderHome() {
    $('avatar').textContent = profile.avatar || '🐱';
    const name = displayName(profile, settings);
    $('hello').textContent = name ? `Bonjour ${name}${NBSP}!` : `Bonjour${NBSP}!`;
    const o = opts();
    $('today').textContent = `Séance du jour${NBSP}: ${o.items}${NBSP}soustractions · 10${NBSP}minutes au plus`;
    const { l, rank, streak, of, top } = levelLine(loadSrs(profileId, TRACK));
    $('level').replaceChildren(
        el('b', {}, `Niveau ${rank} sur ${of}${NBSP}: ${l.label}`),
        el('span', { class: 'ce2-note' }, `Par exemple${NBSP}: ${l.example}`),
        el('div', { class: 'ce2-dots', 'aria-hidden': 'true' }, ...Array.from({ length: MASTERY }, (_, i) => el('span', { class: i < streak ? 'full' : '' }))),
        el('span', { class: 'ce2-note' }, top
            ? 'Dernier niveau ouvert, tu le connais déjà. On continue à s’entraîner.'
            : `Encore ${MASTERY - streak}${NBSP}réussite${MASTERY - streak > 1 ? 's' : ''} du premier coup pour passer au niveau suivant.`));
    for (const b of document.querySelectorAll('.ce2-mode button')) b.setAttribute('aria-pressed', String(b.dataset.mode === o.mode));
}

for (const b of document.querySelectorAll('.ce2-mode button')) {
    b.addEventListener('click', () => { persist(() => saveSettings(profileId, { ce2Mode: b.dataset.mode })); renderHome(); });
}

// ---- keypad ----

let onKey = () => {};
const keyButtons = new Map();
$('keypad').append(...['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'check'].map(k => {
    const b = el('button', { type: 'button', class: k === 'check' ? 'check' : '', 'aria-label': k === 'del' ? 'Effacer' : k === 'check' ? 'Vérifier' : k },
        k === 'del' ? '⌫' : k === 'check' ? 'Vérifier' : k);
    b.addEventListener('click', () => onKey(k));
    keyButtons.set(k, b);
    return b;
}));
function setKeypad({ check, checkEnabled = true, enabled = true }) {
    $('keypad').hidden = false;
    for (const [k, b] of keyButtons) b.disabled = !enabled || (k === 'check' && !checkEnabled);
    keyButtons.get('check').style.visibility = check ? 'visible' : 'hidden';
}

// ---- the operation grid ----

// Builds the grid of `top op bottom` (columns units first in the refs, laid out left to right as in the cahier).
function makeBoard({ top, bottom, op }) {
    const grid = $('grid');
    const t = digitsOf(top);
    const b = digitsOf(bottom);
    const n = t.length;
    const minus = op === '−';
    grid.className = 'ce2-op';
    grid.style.setProperty('--cols', String(n + 1));
    const refs = { r: [], mtop: [], mbot: [] };
    const order = Array.from({ length: n }, (_, k) => n - 1 - k);
    const cells = [el('span')];
    for (const i of order) {
        // The leading column never borrows (the result keeps its digit count): no +10 slot there.
        const m = minus && i < n - 1 ? el('button', { type: 'button', class: 'mark mtop', 'aria-label': `Ajouter 10 en haut, colonne des ${COLUMN_NAMES[i]}` }) : null;
        refs.mtop[i] = m;
        cells.push(el('div', { class: 't' }, m, el('span', {}, String(t[i]))));
    }
    cells.push(el('span', { class: 'sign' }, op));
    for (const i of order) {
        // The units receive no carry: no +1 slot under them.
        const m = minus && i >= 1 ? el('button', { type: 'button', class: 'mark mbot', 'aria-label': `Écrire 1 en bas, colonne des ${COLUMN_NAMES[i]}` }) : null;
        refs.mbot[i] = m;
        cells.push(el('div', { class: 'b' }, i < b.length ? el('span', {}, String(b[i])) : null, m));
    }
    cells.push(el('div', { class: 'bar' }), el('span'));
    for (const i of order) {
        refs.r[i] = el('button', { type: 'button', class: 'r', 'aria-label': `Résultat, colonne des ${COLUMN_NAMES[i]}` });
        cells.push(refs.r[i]);
    }
    grid.replaceChildren(...cells);
    return refs;
}

const feedback = (...nodes) => $('feedback').replaceChildren(...nodes.filter(Boolean));
// The keypad steps aside while the child picks what comes next, so the buttons stay above the fold on a phone.
const waitButtons = (...buttons) => new Promise(resolve => {
    $('keypad').hidden = true;
    $('feedback').append(el('div', { class: 'ce2-row' }, ...buttons.map(([label, value, primary]) =>
        el('button', { type: 'button', class: `ce2-small-btn${primary ? ' primary' : ''}`, onclick: () => resolve(value) }, label))));
});

// Resolves with 'clean' | 'fixed' | 'missed'.
function playProblem(prob, mode) {
    const sol = solve(prob.top, prob.bottom);
    const n = sol.columns.length;
    const refs = makeBoard({ top: prob.top, bottom: prob.bottom, op: '−' });
    const marks = { top: new Set(), bottom: new Set() };
    const values = Array(n).fill(null);
    const lockedMarks = new Set(); // 'top:i' / 'bottom:i' of columns already validated (guidé)
    let active = 0;
    let errors = 0;
    let done = false;
    let resolveProblem;

    const paint = () => {
        refs.r.forEach((r, i) => { r.textContent = values[i] ?? ''; r.classList.toggle('active', !done && i === active); });
        refs.mtop.forEach((m, i) => m?.classList.toggle('on', marks.top.has(i)));
        refs.mbot.forEach((m, i) => m?.classList.toggle('on', marks.bottom.has(i)));
        if (mode === 'solo') setKeypad({ check: true, checkEnabled: values.every(v => v != null), enabled: !done });
        else {
            setKeypad({ check: false, enabled: !done });
            if (!done) $('consigne').textContent = `Colonne des ${COLUMN_NAMES[active]}`;
        }
    };
    const toggleMark = (kind, i) => {
        if (done || lockedMarks.has(`${kind}:${i}`)) return;
        const set = marks[kind];
        if (set.has(i)) set.delete(i); else set.add(i);
        (kind === 'top' ? refs.mtop : refs.mbot)[i].classList.remove('pulse');
        paint();
    };
    refs.mtop.forEach((m, i) => m?.addEventListener('click', () => toggleMark('top', i)));
    refs.mbot.forEach((m, i) => m?.addEventListener('click', () => toggleMark('bottom', i)));
    if (mode === 'solo') refs.r.forEach((r, i) => r.addEventListener('click', () => { if (!done) { active = i; paint(); } }));

    const marksRight = (i) => {
        const c = sol.columns[i];
        return c.borrow === marks.top.has(i) && c.borrow === marks.bottom.has(i + 1);
    };
    const flash = (i) => { const r = refs.r[i]; r.classList.remove('ko'); void r.offsetWidth; r.classList.add('ko'); };

    async function finish(outcome) {
        done = true;
        $('grid').classList.add('locked');
        paint();
        feedback(el('strong', { class: 'ok' }, outcome === 'clean' ? `✔ Bravo, c’est juste${NBSP}!` : `✔ C’est juste${NBSP}!`));
        if (opts().proof) {
            const choice = await waitButtons(['➕ Vérifie avec une addition', 'proof', true], ['Suivant ▶', 'next']);
            if (choice === 'proof') await playProof(prob, sol);
        } else await waitButtons(['Suivant ▶', 'next', true]);
        resolveProblem(outcome);
    }

    async function showSolution() {
        done = true;
        $('grid').classList.add('locked');
        marks.top.clear(); marks.bottom.clear(); values.fill(null);
        for (const r of refs.r) r.classList.remove('ok', 'ko');
        paint();
        const steps = el('ol', { class: 'steps' });
        feedback(el('strong', {}, `Regarde comment on fait${NBSP}:`), steps);
        $('consigne').textContent = 'La solution, colonne par colonne';
        const pause = reducedMotion() ? 300 : 1400;
        for (let i = 0; i < n; i++) {
            const c = sol.columns[i];
            await sleep(pause);
            if (c.borrow) {
                marks.top.add(i); marks.bottom.add(i + 1);
                refs.mtop[i]?.classList.add('shown'); refs.mbot[i + 1]?.classList.add('shown');
            }
            values[i] = c.digit;
            refs.r[i].classList.add('shown');
            steps.append(el('li', {}, `${COLUMN_NAMES[i][0].toUpperCase()}${COLUMN_NAMES[i].slice(1)}${NBSP}: ${columnHint(c, i)}`));
            paint();
        }
        await waitButtons(['Continuer ▶', 'next', true]);
        resolveProblem('missed');
    }

    function guidedKey(k) {
        if (k === 'del' || k === 'check') return;
        const c = sol.columns[active];
        const hasTop = marks.top.has(active);
        const hasBottom = marks.bottom.has(active + 1);
        if (c.borrow && !(hasTop && hasBottom)) {
            if (!hasTop) refs.mtop[active]?.classList.add('pulse');
            if (!hasBottom) refs.mbot[active + 1]?.classList.add('pulse');
            feedback(el('span', {}, `${c.top} est plus petit que ${c.sub}${NBSP}: avant d’écrire, ajoute 10 en haut, et écris 1 en bas dans la colonne des ${COLUMN_NAMES[active + 1]}. Touche les petits ronds.`));
            return;
        }
        if (!c.borrow && (hasTop || hasBottom)) {
            marks.top.delete(active); marks.bottom.delete(active + 1);
            paint();
            feedback(el('span', {}, `Ici, pas besoin de retenue${NBSP}: ${c.top} n’est pas plus petit que ${c.sub}. Le petit 1 est effacé.`));
            return;
        }
        const d = Number(k);
        if (d === c.digit) {
            values[active] = d;
            refs.r[active].classList.add('ok');
            lockedMarks.add(`top:${active}`); lockedMarks.add(`bottom:${active + 1}`);
            active++;
            if (active === n) { finish(errors === 0 ? 'clean' : 'fixed'); return; }
            feedback(el('span', { class: 'ok' }, '✔'));
            paint();
            return;
        }
        errors++;
        flash(active);
        if (errors >= 2) { showSolution(); return; }
        feedback(el('span', {}, `Pas tout à fait. ${columnHint(c, active, { reveal: false })}`));
    }

    function soloKey(k) {
        if (k === 'check') { soloCheck(); return; }
        if (k === 'del') {
            if (values[active] == null && active > 0) active--;
            values[active] = null;
            paint();
            return;
        }
        values[active] = Number(k);
        refs.r[active].classList.remove('ko');
        const next = values.findIndex((v, i) => i > active && v == null);
        if (next >= 0) active = next;
        paint();
    }

    function soloCheck() {
        if (values.some(v => v == null)) return;
        const wrong = sol.columns.map((c, i) => (values[i] === c.digit ? -1 : i)).filter(i => i >= 0);
        const markIssue = sol.columns.findIndex((_, i) => !marksRight(i));
        if (!wrong.length) {
            for (const r of refs.r) r.classList.add('ok');
            finish(errors === 0 ? 'clean' : 'fixed').then(() => {});
            if (markIssue >= 0) {
                const c = sol.columns[markIssue];
                $('feedback').insertBefore(el('span', { class: 'ce2-note' }, `Pour les petits 1, regarde la colonne des ${COLUMN_NAMES[markIssue]}${NBSP}: ${c.borrow ? 'il faut 10 en haut et 1 en bas.' : 'pas besoin de retenue.'}`), $('feedback').children[1] ?? null);
            }
            return;
        }
        errors++;
        for (const i of wrong) { values[i] = null; flash(i); }
        active = wrong[0];
        if (errors >= 2) { showSolution(); return; }
        paint();
        // Explain the first wrong column (often a forgotten 1 below), without giving its digit.
        const tip = columnHint(sol.columns[wrong[0]], wrong[0], { reveal: false });
        feedback(el('span', {}, `Il y a une erreur ${inColumns(wrong)}. ${tip}`));
    }

    return new Promise(resolve => {
        resolveProblem = resolve;
        onKey = (k) => { if (!done) (mode === 'solo' ? soloKey : guidedKey)(k); };
        $('consigne').textContent = mode === 'solo' ? 'Calcule tout, puis touche Vérifier.' : 'Colonne des unités';
        paint();
    });
}

// « Vérifie avec une addition »: résultat + nombre du bas must give the top number back. No penalty either way.
function playProof(prob, sol) {
    const n = sol.columns.length;
    const refs = makeBoard({ top: sol.result, bottom: prob.bottom, op: '+' });
    const values = Array(n).fill(null);
    let active = 0;
    const paint = () => {
        refs.r.forEach((r, i) => { r.textContent = values[i] ?? ''; r.classList.toggle('active', i === active); });
        setKeypad({ check: false });
    };
    $('consigne').textContent = `La preuve${NBSP}: ${sol.result} + ${prob.bottom} doit redonner ${prob.top}.`;
    feedback(el('span', { class: 'ce2-note' }, 'Fais l’addition en commençant par les unités.'));
    paint();
    return new Promise(resolve => {
        onKey = async (k) => {
            if (k === 'check') return;
            if (k === 'del') { if (active > 0 && values[active] == null) active--; values[active] = null; paint(); return; }
            values[active] = Number(k);
            if (active < n - 1) { active++; paint(); return; }
            onKey = () => {};
            active = -1;
            paint();
            setKeypad({ check: false, enabled: false });
            const sum = Number(values.slice().reverse().join(''));
            refs.r.forEach((r, i) => r.classList.add(values[i] === digitsOf(prob.top)[i] ? 'ok' : 'ko'));
            feedback(sum === prob.top
                ? el('strong', { class: 'ok' }, `✔ La preuve est juste${NBSP}: ${sol.result} + ${prob.bottom} = ${prob.top}.`)
                : el('span', {}, `${sol.result} + ${prob.bottom} = ${prob.top}. Ton addition donne ${sum}${NBSP}: refais-la tranquillement sur ton cahier.`));
            await waitButtons(['Suivant ▶', 'next', true]);
            resolve();
        };
    });
}

// ---- session ----

let running = false;

async function runSession() {
    running = true;
    const o = opts();
    const day = today();
    let srs = loadSrs(profileId, TRACK);
    const plan = composeSession({ srs, today: day, items: o.items, unlocked: o.unlocked });
    const items = [];
    const t0 = Date.now();
    let previous = null;
    let banner = null;
    show('exercise');
    for (let i = 0; running && !shouldStop({ index: i, items: plan.length, startedAt: t0, now: Date.now() }); i++) {
        const review = plan[i] !== null;
        const level = review ? plan[i] : ladderOf(srs, o.unlocked).level;
        const prob = generate(level, { previous, zeros: isUnlocked(7, o.unlocked) });
        previous = prob;
        $('counter').textContent = `${i + 1} / ${plan.length}`;
        $('progress').style.width = `${(100 * i) / plan.length}%`;
        $('levelPill').textContent = review ? `Révision · niveau ${rankOf(level)}` : `Niveau ${rankOf(level)}`;
        feedback(banner ? el('strong', {}, banner) : null);
        banner = null;
        const outcome = await playProblem(prob, o.mode);
        if (!running) return;
        items.push({ level, top: prob.top, bottom: prob.bottom, outcome, review });
        srs = recordProblem(srs, { level, outcome, review }, day, o.unlocked);
        persist(() => saveSrs(profileId, TRACK, srs));
        const now = ladderOf(srs, o.unlocked).level;
        if (!review && now > level) banner = `🐱 Niveau ${rankOf(level)} réussi${NBSP}! Nouveau niveau${NBSP}: ${levelById(now).label}.`;
    }
    running = false;
    if (!items.length) { show('home'); renderHome(); return; }
    persist(() => appendSession(profileId, TRACK, { date: new Date().toISOString(), mode: o.mode, items, durationMs: Date.now() - t0 }));
    renderDone(items, srs);
}

function renderDone(items, srs) {
    show('done');
    const outcomes = items.map(x => x.outcome);
    const won = stars(outcomes);
    const name = displayName(profile, settings);
    $('doneTitle').textContent = won ? `Bravo${name ? ` ${name}` : ''}${NBSP}!` : `Séance finie${name ? `, ${name}` : ''}${NBSP}!`;
    $('doneStars').textContent = outcomes.map(o => (o === 'clean' ? '⭐' : o === 'fixed' ? '✔️' : '○')).join(' ');
    $('doneStars').setAttribute('aria-label', `${won}${NBSP}étoile${won > 1 ? 's' : ''} sur ${items.length}`);
    const { l, rank, streak, top } = levelLine(srs);
    $('doneLevel').textContent = top
        ? `Niveau ${rank}${NBSP}: ${l.label}. Dernier niveau ouvert, continue comme ça.`
        : `Niveau ${rank}${NBSP}: ${l.label} · encore ${MASTERY - streak}${NBSP}réussite${MASTERY - streak > 1 ? 's' : ''} du premier coup.`;
    if (won) celebrate({ duration: 3000, pieces: 80 });
}

function start() {
    $('play').disabled = true;
    runSession().catch(err => { console.error(err); running = false; show('home'); renderHome(); })
        .finally(() => { $('play').disabled = false; });
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

// 🏠 quits on a 0.8 s hold or two taps within 2 s.
function quit() { running = false; location.href = 'ce2.html'; }
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
    mountParent($('parent'), { profileId, onBack: () => { show('home'); renderHome(); } });
});
holdToActivate($('avatar'), () => { location.href = 'index.html'; });

renderHome();
show('home');
