# Grande Section Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `gs.html`, a 6-item daily training session for a Grande Section child (sounds, letters, cursive tracing, numbers), on top of a shared core (profiles, Leitner scheduler, session composer, audio) that the 6ème track will reuse.

**Architecture:** Static ES modules, no build. `assets/core/*` holds pure, DOM-free logic (scheduler, composer, audio source selection) plus the storage layer; `assets/gs/*` holds decks (JSON), exercise generators (pure), renderers (DOM) and the Pencil tracing canvas; `gs.html` is a thin shell like the existing quiz pages. Pure modules are unit-tested with Node's built-in test runner; DOM parts get a manual device pass.

**Tech Stack:** Vanilla JS ES modules, Bootstrap 5.3 (CDN, SRI pinned), Web Speech API + `<audio>` clips, Canvas 2D + Pointer Events, `localStorage` via `assets/storage.js`, Node 22 `node --test` for unit tests (no package manager).

**Spec:** `docs/superpowers/specs/2026-10-17-grande-section-track-design.md`

## Global Constraints

- No build step, no framework, no package manager, no backend. `main` is production (GitHub Pages); work on branch `gs-track` in worktree `.worktrees/gs-track`; push to `main` only after the device pass in Task 14 and the user's explicit go.
- `localStorage` is touched only inside `assets/storage.js`. Keys stay under `school.v1.*`.
- Bootstrap 5.3 from jsDelivr with the SRI hash already used in `index.html` (`sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM`, version 5.3.0).
- Child-facing copy is French, simple, spoken. No child-facing text is required reading. Every prompt auto-plays ~350 ms after the screen shows; 🔊 replays it; nothing advances while audio plays.
- Inputs: tap, multi-tap, drag-free slot filling, trace. No keyboard, no typing, no `alert()` for the child (parent corner may use `alert()` per repo convention).
- Session: 6 items, exactly one `trace` slot at position 3 or 4, max 2 number cards, never the same type twice in a row, ≤ 2 new letters / 3 new words / 1 new number per day.
- Leitner GS profile: boxes 1→5 with intervals 1, 2, 4, 7, 7 days; wrong answer drops B2,B3→B1, B4→B2, B5→B3.
- Tap targets ≥ 56 px; works at 390 px wide and iPad portrait; no horizontal scroll.
- Tests: `node --test tests/` must pass before every commit. Test files are `tests/<module>.test.mjs`, one `describe` per function, names `<function>_<condition>_<expectation>`.
- Commit messages: `feat(gs): …` / `feat(core): …` / `test: …` / `docs: …`, each ending with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.

## Review Focus

1. **A day with nothing due and no new cards left** (all decks exhausted, everything in B4/B5 with future `due`): the composer must still return 6 items by padding from the highest boxes, never an empty session or a crash. Test added in Task 4.
2. **A deck item whose emoji the device cannot render** (tofu box): the generator must never produce a choice set where two choices look identical; tests in Task 7 assert distinct `emoji` and distinct `label` per choice set, and the renderer shows the spoken word on long-press so a tofu can still be identified.
3. **Audio that never fires `onend`** (iOS Safari drops events after backgrounding): `speak()` must resolve on a timeout so the session never hangs. Test in Task 5.
4. **Finger drawn while the Pencil is active** (palm on the glass): once a `pen` pointer has been seen, `touch` pointers must be ignored by the trace canvas. Test on the scorer input filter in Task 9.
5. **Profile switch mid-session**: the Leitner record must land under the profile that started the session, not the one active at the end. `app.js` captures `profileId` at session start (Task 10) and the storage test in Task 2 asserts that writes use the explicit `profileId` argument.

---

## File structure

```
assets/
  storage.js                  # MODIFY: add profiles, settings, srs, sessions accessors
  core/
    scheduler.js              # NEW: pure Leitner (GS and default profiles)
    session.js                # NEW: pure composer
    speech.js                 # NEW: audio sources (clips | device | silent) + speak()/setSource()
  gs/
    decks/letters.json        # NEW: 26 letters, 3 scripts, sound, confusables, trace waypoints (subset)
    decks/numbers.json        # NEW: 0..10
    decks/mots-p1.json        # NEW: 15 generic GS words
    decks/index.js            # NEW: loads decks, expands items into cards
    generators.js             # NEW: card → exercise (pure)
    trace-score.js            # NEW: pure waypoint scorer + pointer filter
    trace.js                  # NEW: two-canvas renderer using trace-score
    renderers.js              # NEW: tap / multitap / dots / slots / trace screens
    app.js                    # NEW: session flow for gs.html
    parent.js                 # NEW: parent corner
    gs.css                    # NEW: tiles, trace box, big buttons
  audio/gs/…                  # LATER (Task 13): generated mp3 clips
gs.html                       # NEW: page shell
index.html                    # MODIFY: profile picker + links
tests/*.test.mjs              # NEW: node --test
tools/gen-audio.mjs           # NEW (Task 13): clip generation
ARCHITECTURE.md, README.md, CLAUDE.md   # MODIFY (Task 14)
```

---

### Task 1: Worktree, branch, test runner

**Files:**
- Create: `tests/smoke.test.mjs`
- Create: `tests/helpers/fake-storage.mjs`

- [ ] **Step 1: Create the worktree on a fresh branch from `main`**

```bash
cd /Users/plsgard/Dev/Plsgd/Projects/school
git fetch origin
git worktree add .worktrees/gs-track -b gs-track origin/main
grep -q '^.worktrees/' .git/info/exclude || echo '.worktrees/' >> .git/info/exclude
cd .worktrees/gs-track
```

All later steps run inside `.worktrees/gs-track`.

- [ ] **Step 2: Write the localStorage shim used by every storage test**

```js
// tests/helpers/fake-storage.mjs
export function installFakeLocalStorage() {
    const map = new Map();
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        clear: () => map.clear(),
        key: (i) => [...map.keys()][i] ?? null,
        get length() { return map.size; },
    };
    return globalThis.localStorage;
}
```

- [ ] **Step 3: Write a smoke test that imports the existing storage module**

```js
// tests/smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

installFakeLocalStorage();
const storage = await import('../assets/storage.js');

test('getActiveProfileId_WhenNothingStored_ReturnsDefault', () => {
    assert.equal(storage.getActiveProfileId(), 'default');
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add node test runner with localStorage shim

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Storage accessors for profiles, settings, SRS and sessions

**Files:**
- Modify: `assets/storage.js` (append after `migrateLegacyHistory`)
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Produces:
  - `loadProfiles() → [{id,name,avatar,track}]`, `saveProfiles(list)`, `setActiveProfileId(id)`
  - `loadSettings(profileId) → object`, `saveSettings(profileId, obj)`
  - `loadSrs(profileId, trackId) → {cards:{}, introduced:{}}`, `saveSrs(profileId, trackId, srs)`
  - `appendSession(profileId, trackId, session)`, `loadSessions(profileId, trackId) → []` (newest first, max 14)

- [ ] **Step 1: Write the failing tests**

```js
// tests/storage.test.mjs
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeLocalStorage } from './helpers/fake-storage.mjs';

const ls = installFakeLocalStorage();
const s = await import('../assets/storage.js');

beforeEach(() => ls.clear());

describe('profiles', () => {
    test('loadProfiles_WhenEmpty_ReturnsEmptyArray', () => {
        assert.deepEqual(s.loadProfiles(), []);
    });
    test('saveProfiles_ThenLoad_RoundTrips', () => {
        s.saveProfiles([{ id: 'lou', name: 'Lou', avatar: '🦊', track: 'gs' }]);
        assert.equal(s.loadProfiles()[0].id, 'lou');
    });
    test('setActiveProfileId_ThenGet_ReturnsIt', () => {
        s.setActiveProfileId('lou');
        assert.equal(s.getActiveProfileId(), 'lou');
    });
});

describe('settings', () => {
    test('loadSettings_WhenEmpty_ReturnsDefaults', () => {
        assert.deepEqual(s.loadSettings('lou'), { sessionItems: 6, parentMode: false, firstName: '', audio: 'device', voice: '' });
    });
    test('saveSettings_MergesOverDefaults', () => {
        s.saveSettings('lou', { firstName: 'Lou' });
        assert.equal(s.loadSettings('lou').firstName, 'Lou');
        assert.equal(s.loadSettings('lou').sessionItems, 6);
    });
});

describe('srs', () => {
    test('loadSrs_WhenEmpty_ReturnsEmptyShape', () => {
        assert.deepEqual(s.loadSrs('lou', 'gs'), { cards: {}, introduced: {} });
    });
    test('saveSrs_UsesExplicitProfileNotActiveOne', () => {
        s.setActiveProfileId('tom');
        s.saveSrs('lou', 'gs', { cards: { 'x#y': { box: 1 } }, introduced: {} });
        assert.equal(s.loadSrs('lou', 'gs').cards['x#y'].box, 1);
        assert.deepEqual(s.loadSrs('tom', 'gs'), { cards: {}, introduced: {} });
    });
});

describe('sessions', () => {
    test('appendSession_KeepsNewestFirstAndCapsAt14', () => {
        for (let i = 0; i < 16; i++) s.appendSession('lou', 'gs', { date: `d${i}`, items: [] });
        const all = s.loadSessions('lou', 'gs');
        assert.equal(all.length, 14);
        assert.equal(all[0].date, 'd15');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL, `s.loadProfiles is not a function`.

- [ ] **Step 3: Append the implementation to `assets/storage.js`**

```js
// ---- Profiles, settings, spaced repetition, sessions (learning tracks) ----

const SESSIONS_LIMIT = 14;
const DEFAULT_SETTINGS = { sessionItems: 6, parentMode: false, firstName: '', audio: 'device', voice: '' };

export function loadProfiles() {
    return readJSON(`${NS}.profiles`, []);
}

export function saveProfiles(profiles) {
    writeJSON(`${NS}.profiles`, profiles);
}

export function setActiveProfileId(profileId) {
    localStorage.setItem(`${NS}.activeProfileId`, profileId);
}

export function loadSettings(profileId) {
    return { ...DEFAULT_SETTINGS, ...readJSON(`${NS}.settings.${profileId}`, {}) };
}

export function saveSettings(profileId, patch) {
    const next = { ...loadSettings(profileId), ...patch };
    writeJSON(`${NS}.settings.${profileId}`, next);
    return next;
}

export function loadSrs(profileId, trackId) {
    return readJSON(`${NS}.srs.${profileId}.${trackId}`, { cards: {}, introduced: {} });
}

export function saveSrs(profileId, trackId, srs) {
    writeJSON(`${NS}.srs.${profileId}.${trackId}`, srs);
}

export function loadSessions(profileId, trackId) {
    return readJSON(`${NS}.sessions.${profileId}.${trackId}`, []);
}

export function appendSession(profileId, trackId, session) {
    const key = `${NS}.sessions.${profileId}.${trackId}`;
    const all = readJSON(key, []);
    all.unshift(session);
    if (all.length > SESSIONS_LIMIT) all.length = SESSIONS_LIMIT;
    writeJSON(key, all);
    return all;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add assets/storage.js tests/storage.test.mjs
git commit -m "feat(core): storage accessors for profiles, settings, srs and sessions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Leitner scheduler (pure)

**Files:**
- Create: `assets/core/scheduler.js`
- Test: `tests/scheduler.test.mjs`

**Interfaces:**
- Produces:
  - `const GS_PROFILE = { intervals: [1,2,4,7,7], onWrong: [1,1,1,2,3] }` (index = box-1 → target box)
  - `record(srs, cardId, correctFirstTry, today, profile = GS_PROFILE) → srs` (new object, no mutation)
  - `dueCards(srs, today) → cardId[]` sorted by box asc then due asc
  - `addDays(isoDate, n) → isoDate` (`YYYY-MM-DD`)
  - `boxCounts(srs) → [n1..n5]`

- [ ] **Step 1: Write the failing tests**

```js
// tests/scheduler.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { record, dueCards, addDays, boxCounts, GS_PROFILE } from '../assets/core/scheduler.js';

const T = '2026-10-17';

describe('addDays', () => {
    test('addDays_AcrossMonthEnd_Rolls', () => assert.equal(addDays('2026-10-30', 2), '2026-11-01'));
});

describe('record', () => {
    test('record_NewCardCorrect_GoesToBox2DueIn2Days', () => {
        const srs = record({ cards: {}, introduced: {} }, 'a#trace', true, T);
        assert.deepEqual(srs.cards['a#trace'], { box: 2, due: '2026-10-19', seen: 1, lapses: 0 });
    });
    test('record_NewCardWrong_StaysBox1DueTomorrow', () => {
        const srs = record({ cards: {}, introduced: {} }, 'a#trace', false, T);
        assert.deepEqual(srs.cards['a#trace'], { box: 1, due: '2026-10-18', seen: 1, lapses: 1 });
    });
    test('record_Box5Correct_StaysBox5Weekly', () => {
        const srs = record({ cards: { x: { box: 5, due: T, seen: 9, lapses: 0 } }, introduced: {} }, 'x', true, T);
        assert.equal(srs.cards.x.box, 5);
        assert.equal(srs.cards.x.due, '2026-10-24');
    });
    test('record_Box4Wrong_DropsToBox2', () => {
        const srs = record({ cards: { x: { box: 4, due: T, seen: 3, lapses: 0 } }, introduced: {} }, 'x', false, T);
        assert.equal(srs.cards.x.box, 2);
        assert.equal(srs.cards.x.lapses, 1);
    });
    test('record_DoesNotMutateInput', () => {
        const input = { cards: {}, introduced: {} };
        record(input, 'x', true, T);
        assert.deepEqual(input, { cards: {}, introduced: {} });
    });
});

describe('dueCards', () => {
    test('dueCards_SortsByBoxThenDue', () => {
        const srs = { cards: {
            a: { box: 3, due: '2026-10-10' }, b: { box: 1, due: '2026-10-17' },
            c: { box: 1, due: '2026-10-15' }, d: { box: 2, due: '2026-10-20' } }, introduced: {} };
        assert.deepEqual(dueCards(srs, T), ['c', 'b', 'a']);
    });
});

describe('boxCounts', () => {
    test('boxCounts_CountsPerBox', () => {
        const srs = { cards: { a: { box: 1 }, b: { box: 1 }, c: { box: 5 } }, introduced: {} };
        assert.deepEqual(boxCounts(srs), [2, 0, 0, 0, 1]);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/scheduler.test.mjs`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

```js
// assets/core/scheduler.js
// Pure Leitner scheduler. Dates are ISO day strings (YYYY-MM-DD). Never mutates input.

export const GS_PROFILE = { intervals: [1, 2, 4, 7, 7], onWrong: [1, 1, 1, 2, 3] };

export function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function record(srs, cardId, correctFirstTry, today, profile = GS_PROFILE) {
    const prev = srs.cards[cardId] ?? { box: 1, due: today, seen: 0, lapses: 0 };
    const maxBox = profile.intervals.length;
    const box = correctFirstTry ? Math.min(prev.box + 1, maxBox) : profile.onWrong[prev.box - 1];
    const next = {
        box,
        due: addDays(today, profile.intervals[box - 1]),
        seen: prev.seen + 1,
        lapses: prev.lapses + (correctFirstTry ? 0 : 1),
    };
    return { ...srs, cards: { ...srs.cards, [cardId]: next } };
}

export function dueCards(srs, today) {
    return Object.entries(srs.cards)
        .filter(([, c]) => c.due <= today)
        .sort(([, a], [, b]) => a.box - b.box || a.due.localeCompare(b.due))
        .map(([id]) => id);
}

export function boxCounts(srs) {
    const counts = [0, 0, 0, 0, 0];
    for (const c of Object.values(srs.cards)) counts[c.box - 1]++;
    return counts;
}
```

- [ ] **Step 4: Run tests** — `node --test tests/` — Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add assets/core/scheduler.js tests/scheduler.test.mjs
git commit -m "feat(core): pure Leitner scheduler with GS intervals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Session composer (pure)

**Files:**
- Create: `assets/core/session.js`
- Test: `tests/session.test.mjs`

**Interfaces:**
- Consumes: `dueCards`, `addDays` from `scheduler.js`.
- Card descriptor (produced by `gs/decks/index.js` in Task 6): `{ id, deckId, kind: 'letters'|'words'|'numbers'|'name', skill, item }`. Skill names are the exercise types of the spec §7.
- Produces: `compose({ srs, cards, today, rng = Math.random, constraints = GS_CONSTRAINTS }) → { slots: card[], introduced: cardId[] }`
- `GS_CONSTRAINTS = { items: 6, traceSlots: [2, 3], maxNumbers: 2, newPerDay: { letters: 2, words: 3, numbers: 1, name: 1 } }` (traceSlots are 0-based indexes allowed for the single `trace` card).

- [ ] **Step 1: Write the failing tests**

```js
// tests/session.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compose, GS_CONSTRAINTS } from '../assets/core/session.js';

const T = '2026-10-17';
const card = (id, kind, skill) => ({ id, deckId: kind, kind, skill, item: { id } });
function pool() {
    const c = [];
    for (const l of 'aeiolmnt') for (const sk of ['letter-3scripts', 'sound-letter', 'trace']) c.push(card(`letters/${l}#${sk}`, 'letters', sk));
    for (const w of ['lapin', 'chapeau', 'fusee', 'moto', 'sapin']) for (const sk of ['syll-count', 'syll-match', 'sound-pick']) c.push(card(`words/${w}#${sk}`, 'words', sk));
    for (let n = 0; n <= 10; n++) for (const sk of ['count', 'compare', 'decompose']) c.push(card(`numbers/${n}#${sk}`, 'numbers', sk));
    return c;
}
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('compose', () => {
    test('compose_EmptySrs_Returns6SlotsWithinNewBudget', () => {
        const { slots, introduced } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T, rng: seq(0.1, 0.5, 0.9) });
        assert.equal(slots.length, 6);
        const newLetters = new Set(introduced.filter(id => id.startsWith('letters/')).map(id => id.split('#')[0]));
        assert.ok(newLetters.size <= 2, `letters introduced: ${[...newLetters]}`);
    });
    test('compose_Always_HasExactlyOneTraceInSlot3Or4', () => {
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T });
            const idx = slots.map((s, i) => s.skill === 'trace' ? i : -1).filter(i => i >= 0);
            assert.deepEqual(idx.length, 1);
            assert.ok(GS_CONSTRAINTS.traceSlots.includes(idx[0]));
        }
    });
    test('compose_Always_NoSameTypeTwiceInARowAndMax2Numbers', () => {
        for (let k = 0; k < 50; k++) {
            const { slots } = compose({ srs: { cards: {}, introduced: {} }, cards: pool(), today: T });
            for (let i = 1; i < slots.length; i++) assert.notEqual(slots[i].skill, slots[i - 1].skill);
            assert.ok(slots.filter(s => s.kind === 'numbers').length <= 2);
        }
    });
    test('compose_DueCardsFirst_PrefersLowBoxes', () => {
        const srs = { cards: { 'words/lapin#syll-match': { box: 1, due: T }, 'letters/a#trace': { box: 1, due: T } }, introduced: {} };
        const { slots } = compose({ srs, cards: pool(), today: T });
        assert.ok(slots.some(s => s.id === 'words/lapin#syll-match'));
        assert.ok(slots.some(s => s.id === 'letters/a#trace'));
    });
    test('compose_NothingDueAndNoNewLeft_PadsFromHighBoxes', () => {
        const cards = pool();
        const srs = { cards: {}, introduced: { [T]: [] } };
        for (const c of cards) srs.cards[c.id] = { box: 5, due: '2026-12-01', seen: 9, lapses: 0 };
        const { slots } = compose({ srs, cards, today: T });
        assert.equal(slots.length, 6);
    });
    test('compose_IntroducedToday_CountsAgainstBudget', () => {
        const srs = { cards: {}, introduced: { [T]: ['letters/a', 'letters/e'] } };
        const { introduced } = compose({ srs, cards: pool(), today: T });
        assert.ok(!introduced.some(id => id.startsWith('letters/')));
    });
});
```

- [ ] **Step 2: Run to verify they fail** — `node --test tests/session.test.mjs` — Expected: cannot find module.

- [ ] **Step 3: Implement**

```js
// assets/core/session.js
// Pure session composer. Picks due cards first, introduces new ones within a daily budget,
// then arranges them under variety constraints. Track-agnostic: constraints are injected.
import { dueCards } from './scheduler.js';

export const GS_CONSTRAINTS = {
    items: 6,
    traceSlots: [2, 3],
    maxNumbers: 2,
    newPerDay: { letters: 2, words: 3, numbers: 1, name: 1 },
};

const itemKey = (cardId) => cardId.split('#')[0];

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickNew({ srs, cards, today, constraints, rng }) {
    const alreadyToday = new Set(srs.introduced[today] ?? []);
    const budget = {};
    for (const [kind, n] of Object.entries(constraints.newPerDay)) budget[kind] = n;
    for (const key of alreadyToday) {
        const kind = cards.find(c => itemKey(c.id) === key)?.kind;
        if (kind && budget[kind] > 0) budget[kind]--;
    }
    const chosenItems = new Set();
    const out = [];
    // Deck order is the introduction order (decks list items in teaching order).
    for (const c of cards) {
        if (srs.cards[c.id]) continue;
        const key = itemKey(c.id);
        if (alreadyToday.has(key)) continue;
        if (!chosenItems.has(key)) {
            if ((budget[c.kind] ?? 0) <= 0) continue;
            budget[c.kind]--;
            chosenItems.add(key);
        }
        out.push(c);
    }
    return { newCards: shuffle(out, rng), introduced: [...chosenItems] };
}

function arrange(candidates, constraints, rng) {
    // candidates: ordered by priority (due low box → due → new → padding)
    const n = constraints.items;
    const traceSlot = constraints.traceSlots[Math.floor(rng() * constraints.traceSlots.length)];
    const slots = new Array(n).fill(null);
    const used = new Set();
    const trace = candidates.find(c => c.skill === 'trace');
    if (trace) { slots[traceSlot] = trace; used.add(trace.id); }
    let numbers = 0;
    for (let i = 0; i < n; i++) {
        if (slots[i]) continue;
        const prev = slots[i - 1]?.skill;
        const next = slots[i + 1]?.skill;
        const pick = candidates.find(c =>
            !used.has(c.id) && c.skill !== 'trace' && c.skill !== prev && c.skill !== next &&
            (c.kind !== 'numbers' || numbers < constraints.maxNumbers));
        if (!pick) continue;
        slots[i] = pick; used.add(pick.id);
        if (pick.kind === 'numbers') numbers++;
    }
    return slots.filter(Boolean);
}

export function compose({ srs, cards, today, rng = Math.random, constraints = GS_CONSTRAINTS }) {
    const byId = new Map(cards.map(c => [c.id, c]));
    const due = dueCards(srs, today).map(id => byId.get(id)).filter(Boolean);
    const { newCards, introduced } = pickNew({ srs, cards, today, constraints, rng });
    const padding = shuffle(
        cards.filter(c => srs.cards[c.id] && srs.cards[c.id].due > today)
            .sort((a, b) => srs.cards[b.id].box - srs.cards[a.id].box),
        rng);
    const slots = arrange([...due, ...newCards, ...padding], constraints, rng);
    const usedIntroduced = introduced.filter(key => slots.some(s => itemKey(s.id) === key));
    return { slots, introduced: usedIntroduced };
}
```

- [ ] **Step 4: Run tests** — `node --test tests/` — Expected: all passing. If `compose_Always_HasExactlyOneTraceInSlot3Or4` fails because no `trace` card survived the budget, the pool in the test has 8 letters each with a `trace` card, so `pickNew` must keep every skill of an introduced item (it does: budget is per item, cards of a chosen item are all added).

- [ ] **Step 5: Commit**

```bash
git add assets/core/session.js tests/session.test.mjs
git commit -m "feat(core): pure session composer with GS variety constraints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Audio sources and `speak()` (core)

**Files:**
- Create: `assets/core/speech.js`
- Test: `tests/speech.test.mjs`

**Interfaces:**
- Produces:
  - `createSpeech({ sources, order = ['clips','device','silent'], timeoutMs = (text) => Math.max(1500, text.length * 110) })`
  - returned object: `speak(cue) → Promise<void>`, `setSource(name)`, `getSource()`, `stop()`
  - `cue = { key?: string, text: string }` (`key` addresses a clip, `text` is the TTS fallback and the adult-readable string)
  - a source: `{ name, canPlay(cue) → boolean, play(cue, { onDone }) , stop() }`
  - `createDeviceSource({ synth = window.speechSynthesis, preferredVoice = '' })` and `createClipSource({ baseUrl })`, `SILENT_SOURCE`.

- [ ] **Step 1: Write the failing tests (pure part only: selection, sequencing, timeout)**

```js
// tests/speech.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, SILENT_SOURCE } from '../assets/core/speech.js';

function fakeSource(name, { can = true, finishes = true } = {}) {
    const calls = [];
    return { name, calls, canPlay: () => can, stop() { calls.push('stop'); },
        play(cue, { onDone }) { calls.push(cue.text); if (finishes) setTimeout(onDone, 5); } };
}

describe('speak', () => {
    test('speak_WithSelectedSource_UsesItAndResolvesOnDone', async () => {
        const dev = fakeSource('device');
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE] });
        sp.setSource('device');
        await sp.speak({ text: 'bonjour' });
        assert.deepEqual(dev.calls, ['bonjour']);
    });
    test('speak_WhenSourceCannotPlay_FallsBackToNextInOrder', async () => {
        const clips = fakeSource('clips', { can: false });
        const dev = fakeSource('device');
        const sp = createSpeech({ sources: [clips, dev, SILENT_SOURCE] });
        sp.setSource('clips');
        await sp.speak({ key: 'ui.bravo', text: 'bravo' });
        assert.deepEqual(dev.calls, ['bravo']);
    });
    test('speak_SilentSource_ResolvesImmediatelyWithoutPlaying', async () => {
        const dev = fakeSource('device');
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE] });
        sp.setSource('silent');
        await sp.speak({ text: 'x' });
        assert.deepEqual(dev.calls, []);
    });
    test('speak_WhenOnDoneNeverFires_ResolvesOnTimeout', async () => {
        const dev = fakeSource('device', { finishes: false });
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE], timeoutMs: () => 20 });
        sp.setSource('device');
        const t0 = Date.now();
        await sp.speak({ text: 'long sentence' });
        assert.ok(Date.now() - t0 < 500);
    });
    test('speak_CalledTwice_StopsPreviousFirst', async () => {
        const dev = fakeSource('device', { finishes: false });
        const sp = createSpeech({ sources: [dev, SILENT_SOURCE], timeoutMs: () => 10 });
        sp.setSource('device');
        const p1 = sp.speak({ text: 'a' });
        const p2 = sp.speak({ text: 'b' });
        await Promise.all([p1, p2]);
        assert.deepEqual(dev.calls, ['a', 'stop', 'b']);
    });
});
```

- [ ] **Step 2: Run to verify they fail** — Expected: cannot find module.

- [ ] **Step 3: Implement**

```js
// assets/core/speech.js
// Audio behind one interface. Sources: clips (pre-generated mp3), device (Web Speech), silent (adult reads).
// speak() always resolves: on playback end, on error, or on a timeout.

export const SILENT_SOURCE = { name: 'silent', canPlay: () => true, play: (_cue, { onDone }) => onDone(), stop() {} };

export function createSpeech({ sources, order = ['clips', 'device', 'silent'], timeoutMs = (t) => Math.max(1500, t.length * 110) }) {
    const byName = new Map(sources.map(s => [s.name, s]));
    let selected = order.find(n => byName.has(n)) ?? sources[0].name;
    let current = null; // { source, done }

    function resolveSource(cue) {
        const start = order.indexOf(selected);
        const chain = [selected, ...order.slice(start < 0 ? 0 : start + 1)];
        for (const n of chain) { const s = byName.get(n); if (s && s.canPlay(cue)) return s; }
        return SILENT_SOURCE;
    }

    function stop() {
        if (!current) return;
        current.source.stop();
        const { done } = current; current = null; done();
    }

    function speak(cue) {
        stop();
        const source = resolveSource(cue);
        return new Promise(resolve => {
            let finished = false;
            const done = () => { if (finished) return; finished = true; clearTimeout(timer); if (current?.done === done) current = null; resolve(); };
            const timer = setTimeout(done, timeoutMs(cue.text ?? ''));
            current = { source, done };
            try { source.play(cue, { onDone: done }); } catch { done(); }
        });
    }

    return { speak, stop, setSource: (n) => { if (byName.has(n)) selected = n; }, getSource: () => selected };
}

const PREFERRED = ['Audrey', 'Aurélie', 'Thomas', 'Marie', 'Jacques', 'Google français', 'Microsoft Paul', 'Microsoft Julie', 'Amélie'];
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)/i;

export function rankVoice(v, preferredName = '') {
    let r = 0;
    if (preferredName && v.name === preferredName) return -100;
    if (NOVELTY.test(v.name)) r += 100;
    if (v.lang.replace('_', '-') !== 'fr-FR') r += 20;
    const i = PREFERRED.findIndex(n => v.name.startsWith(n));
    r += i < 0 ? 15 : i;
    if (/premium|enhanced|amélior/i.test(v.name)) r -= 5;
    return r;
}

export function createDeviceSource({ synth = globalThis.speechSynthesis, preferredVoice = '' } = {}) {
    let voices = [];
    const load = () => { voices = (synth?.getVoices() ?? []).filter(v => /^fr([-_]|$)/i.test(v.lang)).sort((a, b) => rankVoice(a, preferredVoice) - rankVoice(b, preferredVoice)); };
    synth?.addEventListener?.('voiceschanged', load);
    load();
    return {
        name: 'device',
        listVoices() { load(); return voices.map(v => ({ name: v.name, lang: v.lang })); },
        setPreferred(name) { preferredVoice = name; load(); },
        canPlay() { load(); return !!synth && voices.length > 0; },
        play(cue, { onDone }) {
            synth.cancel();
            const u = new SpeechSynthesisUtterance(cue.text);
            u.voice = voices[0]; u.lang = voices[0].lang; u.rate = 0.85; u.pitch = 1;
            u.onend = onDone; u.onerror = onDone;
            synth.speak(u);
        },
        stop() { synth?.cancel(); },
    };
}

export function createClipSource({ baseUrl, manifest = new Set() } = {}) {
    // manifest: Set of clip keys that exist (loaded from assets/audio/gs/manifest.json in Task 13)
    let audio = null;
    return {
        name: 'clips',
        canPlay(cue) { return !!cue.key && manifest.has(cue.key); },
        play(cue, { onDone }) {
            audio ??= new Audio();
            audio.onended = onDone; audio.onerror = onDone;
            audio.src = `${baseUrl}/${cue.key.replaceAll('.', '/')}.mp3`;
            audio.play().catch(onDone);
        },
        stop() { if (audio) { audio.pause(); audio.currentTime = 0; } },
    };
}
```

- [ ] **Step 4: Run tests** — `node --test tests/` — Expected: all passing (the test for "stop previous" relies on `stop()` resolving the earlier promise; it does).

- [ ] **Step 5: Commit**

```bash
git add assets/core/speech.js tests/speech.test.mjs
git commit -m "feat(core): swappable audio sources with always-resolving speak()

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Decks and card expansion

**Files:**
- Create: `assets/gs/decks/letters.json`, `assets/gs/decks/numbers.json`, `assets/gs/decks/mots-p1.json`, `assets/gs/decks/index.js`
- Test: `tests/decks.test.mjs`

**Interfaces:**
- Produces: `expandCards(decks, { firstName }) → card[]` where `card = { id, deckId, kind, skill, item, deck }` and `id = <deckId>/<itemId>#<skill>`; `SKILLS_BY_KIND`; `loadDecks(fetchImpl) → Promise<deck[]>`.
- Skill sets: letters → `letter-3scripts`, `sound-letter` (only if `sound`), `trace` (only if `trace`), `blend` (only if `sound` and `continuant`); words → `syll-count`, `syll-match`, `sound-pick`, `rhyme`; numbers → `count`, `decompose` (n ≥ 2), `compare`, `number-line` (1..10); name → `name-spell` only in v1 (whole-name tracing deferred).

- [ ] **Step 1: Write `letters.json`** (teaching order: vowels, then continuants, then the rest; `sound` null for occlusives; `trace` = waypoints in a 100×100 box for the first ten letters, `null` otherwise; `confusables` by visual proximity)

```json
{ "id": "letters", "kind": "letters", "label": "Lettres de l'alphabet", "items": [
 { "id": "a", "cap": "A", "script": "a", "cursive": "a", "name": "a", "sound": "a", "continuant": false, "confusables": ["o","e"], "trace": [[66,46],[56,38],[42,38],[32,48],[32,62],[42,72],[56,72],[66,62],[66,46],[66,58],[66,72],[72,78],[80,74]] },
 { "id": "e", "cap": "E", "script": "e", "cursive": "e", "name": "e", "sound": "e", "continuant": false, "confusables": ["c","o"], "trace": [[34,62],[48,56],[60,60],[56,70],[44,74],[34,66],[36,54],[46,42],[58,40],[66,48],[66,62],[72,76],[82,72]] },
 { "id": "i", "cap": "I", "script": "i", "cursive": "i", "name": "i", "sound": "i", "continuant": false, "confusables": ["l","j"], "trace": [[40,56],[46,46],[52,42],[54,50],[52,62],[52,72],[58,78],[68,74]], "dot": [53,30] },
 { "id": "o", "cap": "O", "script": "o", "cursive": "o", "name": "o", "sound": "o", "continuant": false, "confusables": ["a","c"], "trace": [[64,46],[54,38],[42,40],[34,50],[34,62],[42,72],[54,72],[62,64],[64,52],[60,44],[66,40],[76,42]] },
 { "id": "u", "cap": "U", "script": "u", "cursive": "u", "name": "u", "sound": "u", "continuant": false, "confusables": ["v","n"], "trace": [[30,46],[34,60],[38,72],[46,72],[52,60],[54,48],[56,62],[58,72],[64,76],[74,72]] },
 { "id": "l", "cap": "L", "script": "l", "cursive": "l", "name": "elle", "sound": "l", "continuant": true, "confusables": ["i","t"], "trace": [[36,72],[40,60],[46,40],[52,22],[56,14],[58,22],[54,40],[48,58],[44,72],[50,78],[60,74]] },
 { "id": "m", "cap": "M", "script": "m", "cursive": "m", "name": "emme", "sound": "m", "continuant": true, "confusables": ["n","w"], "trace": [[22,72],[24,56],[28,44],[34,42],[38,52],[38,66],[40,52],[46,42],[52,44],[54,56],[54,66],[56,52],[62,42],[68,44],[70,58],[70,72],[76,78],[84,74]] },
 { "id": "n", "cap": "N", "script": "n", "cursive": "n", "name": "enne", "sound": "n", "continuant": true, "confusables": ["m","u"], "trace": [[30,72],[32,56],[36,44],[42,42],[46,52],[46,66],[48,52],[54,42],[60,44],[62,58],[62,72],[68,78],[78,74]] },
 { "id": "t", "cap": "T", "script": "t", "cursive": "t", "name": "té", "sound": null, "continuant": false, "confusables": ["l","f"], "trace": [[42,72],[44,56],[46,40],[48,30],[48,44],[46,60],[46,72],[52,78],[62,74]], "bar": [[36,46],[60,46]] },
 { "id": "s", "cap": "S", "script": "s", "cursive": "s", "name": "esse", "sound": "s", "continuant": true, "confusables": ["z","r"], "trace": [[34,70],[42,56],[50,46],[56,44],[52,52],[48,62],[54,70],[62,72],[70,66]] },
 { "id": "r", "cap": "R", "script": "r", "cursive": "r", "name": "erre", "sound": "r", "continuant": true, "confusables": ["n","v"], "trace": null },
 { "id": "f", "cap": "F", "script": "f", "cursive": "f", "name": "effe", "sound": "f", "continuant": true, "confusables": ["t","v"], "trace": null },
 { "id": "v", "cap": "V", "script": "v", "cursive": "v", "name": "vé", "sound": "v", "continuant": true, "confusables": ["u","f"], "trace": null },
 { "id": "j", "cap": "J", "script": "j", "cursive": "j", "name": "ji", "sound": "j", "continuant": true, "confusables": ["i","g"], "trace": null },
 { "id": "z", "cap": "Z", "script": "z", "cursive": "z", "name": "zède", "sound": "z", "continuant": true, "confusables": ["s","n"], "trace": null },
 { "id": "p", "cap": "P", "script": "p", "cursive": "p", "name": "pé", "sound": null, "continuant": false, "confusables": ["q","b"], "trace": null },
 { "id": "b", "cap": "B", "script": "b", "cursive": "b", "name": "bé", "sound": null, "continuant": false, "confusables": ["d","p"], "trace": null },
 { "id": "d", "cap": "D", "script": "d", "cursive": "d", "name": "dé", "sound": null, "continuant": false, "confusables": ["b","q"], "trace": null },
 { "id": "c", "cap": "C", "script": "c", "cursive": "c", "name": "cé", "sound": null, "continuant": false, "confusables": ["e","o"], "trace": null },
 { "id": "g", "cap": "G", "script": "g", "cursive": "g", "name": "gé", "sound": null, "continuant": false, "confusables": ["q","j"], "trace": null },
 { "id": "k", "cap": "K", "script": "k", "cursive": "k", "name": "ka", "sound": null, "continuant": false, "confusables": ["h","x"], "trace": null },
 { "id": "q", "cap": "Q", "script": "q", "cursive": "q", "name": "ku", "sound": null, "continuant": false, "confusables": ["p","g"], "trace": null },
 { "id": "h", "cap": "H", "script": "h", "cursive": "h", "name": "ache", "sound": null, "continuant": false, "confusables": ["n","k"], "trace": null },
 { "id": "w", "cap": "W", "script": "w", "cursive": "w", "name": "double vé", "sound": null, "continuant": false, "confusables": ["m","v"], "trace": null },
 { "id": "x", "cap": "X", "script": "x", "cursive": "x", "name": "ixe", "sound": null, "continuant": false, "confusables": ["k","y"], "trace": null },
 { "id": "y", "cap": "Y", "script": "y", "cursive": "y", "name": "i grec", "sound": "i", "continuant": false, "confusables": ["v","x"], "trace": null }
]}
```

- [ ] **Step 2: Write `numbers.json`**

```json
{ "id": "numbers", "kind": "numbers", "label": "Nombres de 0 à 10", "items": [
 { "id": "0", "n": 0, "say": "zéro" }, { "id": "1", "n": 1, "say": "un" }, { "id": "2", "n": 2, "say": "deux" },
 { "id": "3", "n": 3, "say": "trois" }, { "id": "4", "n": 4, "say": "quatre" }, { "id": "5", "n": 5, "say": "cinq" },
 { "id": "6", "n": 6, "say": "six" }, { "id": "7", "n": 7, "say": "sept" }, { "id": "8", "n": 8, "say": "huit" },
 { "id": "9", "n": 9, "say": "neuf" }, { "id": "10", "n": 10, "say": "dix" }
]}
```

- [ ] **Step 3: Write `mots-p1.json`** (generic GS words; `phon` uses the letter ids of `letters.json` for the initial sound so `sound-letter` can map it; `rhyme` groups by the last syllable)

```json
{ "id": "mots-p1", "kind": "words", "label": "Mots · période 1", "items": [
 { "id": "lapin",   "text": "lapin",   "emoji": "🐰", "syll": ["la","pin"],  "initial": "l", "rhyme": "pin" },
 { "id": "sapin",   "text": "sapin",   "emoji": "🌲", "syll": ["sa","pin"],  "initial": "s", "rhyme": "pin" },
 { "id": "lavabo",  "text": "lavabo",  "emoji": "🚿", "syll": ["la","va","bo"], "initial": "l", "rhyme": "bo" },
 { "id": "chapeau", "text": "chapeau", "emoji": "🎩", "syll": ["cha","peau"], "initial": "ch", "rhyme": "o" },
 { "id": "bateau",  "text": "bateau",  "emoji": "⛵", "syll": ["ba","teau"], "initial": "b", "rhyme": "o" },
 { "id": "moto",    "text": "moto",    "emoji": "🏍️", "syll": ["mo","to"],   "initial": "m", "rhyme": "o" },
 { "id": "fusee",   "text": "fusée",   "emoji": "🚀", "syll": ["fu","sée"],  "initial": "f", "rhyme": "é" },
 { "id": "souris",  "text": "souris",  "emoji": "🐭", "syll": ["sou","ris"], "initial": "s", "rhyme": "i" },
 { "id": "radis",   "text": "radis",   "emoji": "🥕", "syll": ["ra","dis"],  "initial": "r", "rhyme": "i" },
 { "id": "velo",    "text": "vélo",    "emoji": "🚲", "syll": ["vé","lo"],   "initial": "v", "rhyme": "o" },
 { "id": "maison",  "text": "maison",  "emoji": "🏠", "syll": ["mai","son"], "initial": "m", "rhyme": "on" },
 { "id": "ballon",  "text": "ballon",  "emoji": "🎈", "syll": ["ba","llon"], "initial": "b", "rhyme": "on" },
 { "id": "banane",  "text": "banane",  "emoji": "🍌", "syll": ["ba","na","ne"], "initial": "b", "rhyme": "ane" },
 { "id": "voiture", "text": "voiture", "emoji": "🚗", "syll": ["voi","ture"], "initial": "v", "rhyme": "ure" },
 { "id": "chat",    "text": "chat",    "emoji": "🐱", "syll": ["chat"],      "initial": "ch", "rhyme": "a" }
]}
```

- [ ] **Step 4: Write the failing tests for `expandCards`**

```js
// tests/decks.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards } from '../assets/gs/decks/index.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];

describe('expandCards', () => {
    test('expandCards_LetterWithSoundAndTrace_HasFourSkills', () => {
        const a = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/l#')).map(c => c.skill).sort();
        assert.deepEqual(a, ['blend', 'letter-3scripts', 'sound-letter', 'trace']);
    });
    test('expandCards_OcclusiveWithoutTrace_HasOnlyThreeScripts', () => {
        const p = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('letters/p#')).map(c => c.skill);
        assert.deepEqual(p, ['letter-3scripts']);
    });
    test('expandCards_Numbers_ZeroHasNoDecomposeOrLine', () => {
        const z = expandCards(decks, { firstName: '' }).filter(c => c.id.startsWith('numbers/0#')).map(c => c.skill).sort();
        assert.deepEqual(z, ['compare', 'count']);
    });
    test('expandCards_FirstNameGiven_AddsNameSpellCard', () => {
        const cards = expandCards(decks, { firstName: 'Lou' });
        assert.ok(cards.some(c => c.id === 'name/lou#name-spell'));
    });
    test('expandCards_Always_IdsAreUnique', () => {
        const ids = expandCards(decks, { firstName: 'Lou' }).map(c => c.id);
        assert.equal(new Set(ids).size, ids.length);
    });
    test('letters_Deck_Has26ItemsWithConfusables', () => {
        const letters = decks[0].items;
        assert.equal(letters.length, 26);
        for (const l of letters) assert.ok(l.confusables.length >= 2, l.id);
    });
});
```

- [ ] **Step 5: Run to verify they fail** — Expected: cannot find module `decks/index.js`.

- [ ] **Step 6: Implement `decks/index.js`**

```js
// assets/gs/decks/index.js
// Loads deck JSON and expands every item into (item, skill) cards. Pure except loadDecks.

export const DECK_FILES = ['letters', 'numbers', 'mots-p1'];

export async function loadDecks(fetchImpl = fetch, base = 'assets/gs/decks') {
    return Promise.all(DECK_FILES.map(async n => (await fetchImpl(`${base}/${n}.json`)).json()));
}

function skillsFor(kind, item) {
    switch (kind) {
        case 'letters': return [
            'letter-3scripts',
            item.sound ? 'sound-letter' : null,
            item.trace ? 'trace' : null,
            item.sound && item.continuant ? 'blend' : null,
        ].filter(Boolean);
        case 'words': return ['syll-count', 'syll-match', 'sound-pick', 'rhyme'];
        case 'numbers': return [
            'count', 'compare',
            item.n >= 2 ? 'decompose' : null,
            item.n >= 1 ? 'number-line' : null,
        ].filter(Boolean);
        case 'name': return ['name-spell']; // v1: tracing the whole first name is deferred (needs composite waypoints)
        default: return [];
    }
}

export function expandCards(decks, { firstName = '' } = {}) {
    const cards = [];
    for (const deck of decks) {
        for (const item of deck.items) {
            for (const skill of skillsFor(deck.kind, item)) {
                cards.push({ id: `${deck.id}/${item.id}#${skill}`, deckId: deck.id, kind: deck.kind, skill, item, deck });
            }
        }
    }
    const name = firstName.trim();
    if (name) {
        const item = { id: name.toLowerCase(), text: name };
        const deck = { id: 'name', kind: 'name', label: 'Prénom', items: [item] };
        for (const skill of skillsFor('name', item)) {
            cards.push({ id: `name/${item.id}#${skill}`, deckId: 'name', kind: 'name', skill, item, deck });
        }
    }
    return cards;
}
```

- [ ] **Step 7: Run tests** — `node --test tests/` — Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add assets/gs/decks tests/decks.test.mjs
git commit -m "feat(gs): letter, number and word decks with card expansion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Exercise generators (pure)

**Files:**
- Create: `assets/gs/generators.js`
- Test: `tests/generators.test.mjs`

**Interfaces:**
- Consumes: cards from Task 6.
- Produces: `generate(card, { cards, rng = Math.random }) → exercise`

```
exercise = {
  type: card.skill, cardId: card.id,
  prompt: { key, text },                       // spoken on arrival, replayed by 🔊
  layout: 'tap' | 'multitap' | 'dots' | 'slots' | 'trace',
  stage?: { emoji?, text?, html?, collection?, sequence? },   // what is shown above the choices
  choices?: [{ id, label, emoji?, say: {key,text}, correct, style? }],
  target?: number,  lit?: number,              // dots
  answer?: string,                              // slots (ordered letters)
  trace?: { pts, dot?, bar?, label, say },      // trace
  success: { key, text }
}
```

- [ ] **Step 1: Write the failing tests**

```js
// tests/generators.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards } from '../assets/gs/decks/index.js';
import { generate } from '../assets/gs/generators.js';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];
const cards = expandCards(decks, { firstName: 'Lou' });
const find = (id) => cards.find(c => c.id === id);
const rng = () => 0.42;

function assertChoiceSet(ex, n) {
    assert.equal(ex.choices.length, n);
    assert.equal(ex.choices.filter(c => c.correct).length, 1, 'exactly one correct');
    assert.equal(new Set(ex.choices.map(c => c.label)).size, n, 'distinct labels');
    if (ex.choices[0].emoji) assert.equal(new Set(ex.choices.map(c => c.emoji)).size, n, 'distinct emoji');
}

describe('generate', () => {
    test('generate_SyllMatch_CorrectSharesInitialSyllable', () => {
        const ex = generate(find('mots-p1/lapin#syll-match'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.equal(ex.choices.find(c => c.correct).label, 'lavabo');
        assert.ok(!ex.choices.some(c => c.label === 'lapin'));
    });
    test('generate_SyllCount_TargetIsSyllableCount', () => {
        const ex = generate(find('mots-p1/banane#syll-count'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.equal(ex.choices.find(c => c.correct).id, '3');
    });
    test('generate_SoundPick_DistractorsNeverShareInitial', () => {
        const ex = generate(find('mots-p1/fusee#sound-pick'), { cards, rng });
        assertChoiceSet(ex, 3);
        for (const c of ex.choices.filter(c => !c.correct)) assert.notEqual(c.id, 'fusee');
    });
    test('generate_SoundLetter_UsesOnlyContinuantsAndIncludesConfusable', () => {
        const ex = generate(find('letters/f#sound-letter'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.ok(ex.choices.some(c => c.label === 'v' || c.label === 't'));
    });
    test('generate_Letter3Scripts_HasThreeTargetsAndConfusables', () => {
        const ex = generate(find('letters/a#letter-3scripts'), { cards, rng });
        assert.equal(ex.layout, 'multitap');
        assert.equal(ex.choices.length, 6);
        assert.equal(ex.choices.filter(c => c.correct).length, 3);
    });
    test('generate_Count_CollectionSizeMatchesAndSixDigits', () => {
        const ex = generate(find('numbers/7#count'), { cards, rng });
        assert.equal(ex.stage.collection.length, 7);
        assertChoiceSet(ex, 6);
        assert.equal(ex.choices.find(c => c.correct).label, '7');
    });
    test('generate_Decompose_LitPlusMissingEqualsTarget', () => {
        const ex = generate(find('numbers/5#decompose'), { cards, rng });
        assert.equal(ex.layout, 'dots');
        assert.equal(ex.target, 5);
        assert.ok(ex.lit >= 1 && ex.lit < 5);
    });
    test('generate_Compare_BiggerIsCorrect', () => {
        const ex = generate(find('numbers/8#compare'), { cards, rng });
        assertChoiceSet(ex, 2);
        const ok = ex.choices.find(c => c.correct), ko = ex.choices.find(c => !c.correct);
        assert.ok(Number(ok.id) > Number(ko.id));
    });
    test('generate_NameSpell_AnswerIsUppercaseName', () => {
        const ex = generate(find('name/lou#name-spell'), { cards, rng });
        assert.equal(ex.layout, 'slots');
        assert.equal(ex.answer, 'LOU');
        assert.equal(ex.choices.length, 3);
    });
    test('generate_Trace_CarriesWaypoints', () => {
        const ex = generate(find('letters/a#trace'), { cards, rng });
        assert.equal(ex.layout, 'trace');
        assert.ok(ex.trace.pts.length > 5);
    });
    test('generate_Blend_CorrectIsConsonantPlusVowel', () => {
        const ex = generate(find('letters/f#blend'), { cards, rng });
        assertChoiceSet(ex, 3);
        assert.match(ex.choices.find(c => c.correct).label, /^f[aeiou]$/);
    });
    test('generate_EveryCard_ProducesAnExerciseWithPromptAndSuccess', () => {
        for (const card of cards) {
            const ex = generate(card, { cards, rng });
            assert.ok(ex.prompt.text.length > 0, card.id);
            assert.ok(ex.success.text.length > 0, card.id);
        }
    });
});
```

- [ ] **Step 2: Run to verify they fail** — Expected: cannot find module.

- [ ] **Step 3: Implement**

```js
// assets/gs/generators.js
// Pure: card → exercise. Distractors follow the Repères CP trap lists (visual/phonetic confusables).

const VOWELS = ['a', 'e', 'i', 'o', 'u'];
const DOTS = { 1: '●', 2: '● ●', 3: '● ● ●' };
const EMOJI_SETS = ['🍎', '🐞', '⭐', '🐟', '🎈', '🌼'];

const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const cue = (key, text) => ({ key, text });
const itemsOf = (cards, kind) => { const seen = new Map(); for (const c of cards) if (c.kind === kind) seen.set(c.item.id, c.item); return [...seen.values()]; };

function wordChoice(w, correct) {
    return { id: w.id, label: w.text, emoji: w.emoji, say: cue(`word.${w.id}`, w.text), correct };
}

function pickDistinct(pool, n, rng, used = new Set()) {
    const out = [];
    for (const w of shuffle(pool, rng)) {
        if (out.length === n) break;
        if (used.has(w.emoji) || used.has(w.id)) continue;
        used.add(w.emoji); used.add(w.id); out.push(w);
    }
    return out;
}

const GEN = {
    'syll-count'(card, { rng }) {
        const w = card.item, n = Math.min(w.syll.length, 3);
        return {
            layout: 'tap', prompt: cue(`ui.syll-count.${w.id}`, `Frappe dans tes mains : ${w.syll.join('-')}. Combien de syllabes dans ${w.text} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: [1, 2, 3].map(k => ({ id: String(k), label: DOTS[k], say: cue(`num.${k}`, String(k)), correct: k === n })),
            success: cue(`ui.syll-count-ok.${w.id}`, `Bravo ! ${w.syll.join(' – ').toUpperCase()}, ${n === 1 ? 'une syllabe' : n + ' syllabes'}.`),
        };
    },
    'syll-match'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words').filter(x => x.id !== w.id);
        const same = words.filter(x => x.syll[0] === w.syll[0]);
        const target = same.length ? pick(same, rng) : pick(words, rng);
        const used = new Set([target.emoji, target.id, w.emoji, w.id]);
        const distractors = pickDistinct(words.filter(x => x.syll[0] !== w.syll[0]), 2, rng, used);
        return {
            layout: 'tap', prompt: cue(`ui.syll-match.${w.id}`, `Écoute bien. Quel mot commence comme ${w.syll.join('-')} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.syll-match-ok.${w.id}.${target.id}`, `Oui ! ${w.syll[0].toUpperCase()}-${w.syll.slice(1).join('')}, ${target.syll[0].toUpperCase()}-${target.syll.slice(1).join('')} !`),
        };
    },
    'rhyme'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words').filter(x => x.id !== w.id);
        const same = words.filter(x => x.rhyme === w.rhyme);
        const target = same.length ? pick(same, rng) : pick(words, rng);
        const used = new Set([target.emoji, target.id, w.emoji, w.id]);
        const distractors = pickDistinct(words.filter(x => x.rhyme !== w.rhyme), 2, rng, used);
        return {
            layout: 'tap', prompt: cue(`ui.rhyme.${w.id}`, `Qu'est-ce qui rime avec ${w.text} ?`),
            stage: { emoji: w.emoji, text: w.text },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.rhyme-ok.${w.id}.${target.id}`, `Oui ! ${w.text}, ${target.text}, ça rime !`),
        };
    },
    'sound-pick'(card, { cards, rng }) {
        const w = card.item, words = itemsOf(cards, 'words');
        const same = words.filter(x => x.id !== w.id && x.initial === w.initial);
        const target = same.length ? pick(same, rng) : w;
        const used = new Set([target.emoji, target.id]);
        const distractors = pickDistinct(words.filter(x => x.initial !== w.initial), 2, rng, used);
        const stretched = w.initial.length === 1 ? w.initial.repeat(3) : w.initial;
        return {
            layout: 'tap', prompt: cue(`ui.sound-pick.${w.initial}`, `Quel mot commence par ${stretched} ?`),
            stage: { text: stretched },
            choices: shuffle([wordChoice(target, true), ...distractors.map(d => wordChoice(d, false))], rng),
            success: cue(`ui.sound-pick-ok.${target.id}`, `Oui ! ${stretched}, ${target.text} !`),
        };
    },
    'sound-letter'(card, { cards, rng }) {
        const l = card.item, letters = itemsOf(cards, 'letters');
        const words = itemsOf(cards, 'words').filter(w => w.initial === l.id);
        const w = words.length ? pick(words, rng) : null;
        const conf = letters.find(x => x.id === l.confusables[0]) ?? pick(letters.filter(x => x.id !== l.id), rng);
        const other = pick(letters.filter(x => x.id !== l.id && x.id !== conf.id && x.sound), rng);
        const letterChoice = (x, correct) => ({ id: x.id, label: x.script, say: cue(`letter.${x.id}.name`, x.name), correct });
        return {
            layout: 'tap', prompt: cue(`ui.sound-letter.${l.id}`, w ? `${l.sound.repeat(3)}${w.text.slice(1)}. Quelle lettre chante au début de ${w.text} ?` : `Quelle lettre fait le son ${l.sound.repeat(3)} ?`),
            stage: w ? { emoji: w.emoji, text: w.text } : { text: l.sound.repeat(3) },
            choices: shuffle([letterChoice(l, true), letterChoice(conf, false), letterChoice(other, false)], rng),
            success: cue(`ui.sound-letter-ok.${l.id}`, `Oui, ${l.name} comme ${w ? w.text : l.sound.repeat(3)} !`),
        };
    },
    'letter-3scripts'(card, { cards, rng }) {
        const l = card.item, letters = itemsOf(cards, 'letters');
        const confs = l.confusables.map(id => letters.find(x => x.id === id)).filter(Boolean);
        while (confs.length < 3) confs.push(pick(letters.filter(x => x.id !== l.id && !confs.includes(x)), rng));
        const styles = ['cap', 'script', 'cursive'];
        const mk = (x, style, correct) => ({ id: `${x.id}-${style}`, label: x[style], style, say: cue(`letter.${x.id}.name`, x.name), correct });
        const choices = [
            ...styles.map(s => mk(l, s, true)),
            ...confs.slice(0, 3).map((x, i) => mk(x, styles[i], false)),
        ];
        return {
            layout: 'multitap', prompt: cue(`ui.letter-3scripts.${l.id}`, `Trouve toutes les lettres ${l.name}. Il y en a trois.`),
            choices: shuffle(choices, rng),
            success: cue(`ui.letter-3scripts-ok.${l.id}`, `Bravo, les trois ${l.name} !`),
        };
    },
    'blend'(card, { rng }) {
        const l = card.item;
        const v = pick(VOWELS, rng);
        const others = shuffle(VOWELS.filter(x => x !== v), rng).slice(0, 1);
        const confC = pick(['s', 'v', 'f', 'r', 'l', 'm', 'n', 'j', 'z'].filter(c => c !== l.id), rng);
        const choices = shuffle([
            { id: `${l.id}${v}`, label: `${l.id}${v}`, say: cue(`syl.${l.id}${v}`, `${l.id}${v}`), correct: true },
            { id: `${l.id}${others[0]}`, label: `${l.id}${others[0]}`, say: cue(`syl.${l.id}${others[0]}`, `${l.id}${others[0]}`), correct: false },
            { id: `${confC}${v}`, label: `${confC}${v}`, say: cue(`syl.${confC}${v}`, `${confC}${v}`), correct: false },
        ], rng);
        return {
            layout: 'tap', prompt: cue(`ui.blend.${l.id}${v}`, `Colle les sons : ${l.sound.repeat(3)}… ${v.repeat(3)}… Qu'est-ce que ça fait ?`),
            stage: { html: `<span class="tile">${l.id}</span><span class="plus">+</span><span class="tile">${v}</span>` },
            choices,
            success: cue(`ui.blend-ok.${l.id}${v}`, `Oui ! ${l.sound.repeat(3)} et ${v.repeat(3)}, ça fait ${l.id}${v} !`),
        };
    },
    'trace'(card) {
        const it = card.item;
        return {
            layout: 'trace',
            prompt: cue(`ui.trace.${it.id}`, `Trace le ${it.name}. Pars du point vert.`),
            trace: { pts: it.trace, dot: it.dot, bar: it.bar, label: it.cursive, say: cue(`letter.${it.id}.name`, it.name) },
            success: cue(`ui.trace-ok.${it.id}`, `Super ${it.name} !`),
        };
    },
    'name-spell'(card, { rng }) {
        const name = card.item.text.toUpperCase();
        const letters = [...name];
        return {
            layout: 'slots', prompt: cue('ui.name-spell', 'Remets les lettres de ton prénom dans l\'ordre.'),
            answer: name,
            choices: shuffle(letters.map((ch, i) => ({ id: `${ch}${i}`, label: ch, say: cue(`letter.${ch.toLowerCase()}.name`, ch), correct: true })), rng),
            success: cue('ui.name-spell-ok', `${letters.join(', ')} : ${card.item.text} !`),
        };
    },
    'count'(card, { rng }) {
        const n = card.item.n, emoji = pick(EMOJI_SETS, rng);
        const lo = Math.max(0, Math.min(n - 2, 5)), digits = Array.from({ length: 6 }, (_, i) => lo + i);
        return {
            layout: 'tap', prompt: cue('ui.count', `Combien y en a-t-il ?`),
            stage: { collection: Array(n).fill(emoji), scattered: rng() < 0.5 },
            choices: digits.map(d => ({ id: String(d), label: String(d), say: cue(`num.${d}`, String(d)), correct: d === n, style: 'digit' })),
            success: cue(`ui.count-ok.${n}`, `${card.item.say} ! ${n}.`),
        };
    },
    'decompose'(card, { rng }) {
        const n = card.item.n, lit = 1 + Math.floor(rng() * (n - 1));
        return {
            layout: 'dots', prompt: cue(`ui.decompose.${n}.${lit}`, `${card.item.say}, c'est ${lit} et encore combien ? Allume les ronds.`),
            target: n, lit, total: Math.max(n + 1, 6),
            success: cue(`ui.decompose-ok.${n}.${lit}`, `Oui ! ${card.item.say}, c'est ${lit} et ${n - lit}.`),
        };
    },
    'compare'(card, { cards, rng }) {
        const n = card.item.n;
        const others = itemsOf(cards, 'numbers').filter(x => x.n !== n);
        const close = others.filter(x => Math.abs(x.n - n) <= 2);
        const o = pick(close.length ? close : others, rng);
        const emoji = pick(EMOJI_SETS, rng);
        const mk = (x) => ({ id: String(x.n), label: String(x.n), collection: Array(x.n).fill(emoji), say: cue(`num.${x.n}`, x.say), correct: x.n === Math.max(n, o.n) });
        return {
            layout: 'tap', prompt: cue('ui.compare', 'Où y a-t-il le plus ?'),
            stage: { showCollections: true },
            choices: shuffle([mk(card.item), mk(o)], rng),
            success: cue(`ui.compare-ok.${Math.max(n, o.n)}.${Math.min(n, o.n)}`, `Oui, ${Math.max(n, o.n)}, c'est plus que ${Math.min(n, o.n)} !`),
        };
    },
    'number-line'(card, { rng }) {
        const n = card.item.n;
        const line = Array.from({ length: 10 }, (_, i) => i + 1).map(k => (k === n ? '?' : String(k)));
        const wrong = shuffle([n - 1, n + 1, n + 2, n - 2].filter(k => k >= 1 && k <= 10 && k !== n), rng).slice(0, 2);
        return {
            layout: 'tap', prompt: cue('ui.number-line', 'Quel nombre manque sur la ligne ?'),
            stage: { sequence: line },
            choices: shuffle([n, ...wrong].map(k => ({ id: String(k), label: String(k), say: cue(`num.${k}`, String(k)), correct: k === n, style: 'digit' })), rng),
            success: cue(`ui.number-line-ok.${n}`, `Oui, ${card.item.say} vient après ${n - 1} !`),
        };
    },
};

export function generate(card, { cards = [], rng = Math.random } = {}) {
    const gen = GEN[card.skill];
    if (!gen) throw new Error(`No generator for skill ${card.skill}`);
    return { type: card.skill, cardId: card.id, ...gen(card, { cards, rng }) };
}
```

Note: `pattern` (ABB/ABAB) is not card-based; it is generated by the composer padding in Task 10 as a bonus item via `generatePattern(rng)` exported from the same file:

```js
export function generatePattern(rng = Math.random) {
    const pair = pick([['🔴', '🔵'], ['🟢', '🟡'], ['⭐', '🌙']], rng);
    const motif = pick([[0, 1, 1], [0, 1], [0, 0, 1]], rng);
    const seq = Array.from({ length: 7 }, (_, i) => pair[motif[i % motif.length]]);
    const answer = seq.pop();
    const third = pick(['🟣', '🟠', '🤍'].filter(e => !pair.includes(e)), rng);
    return {
        type: 'pattern', cardId: null, layout: 'tap', prompt: cue('ui.pattern', 'Regarde bien. Qu\'est-ce qui vient après ?'),
        stage: { sequence: [...seq, '?'] },
        choices: shuffle([pair[0], pair[1], third].map(e => ({ id: e, label: e, emoji: e, say: cue('ui.this-one', 'celui-là'), correct: e === answer })), rng),
        success: cue('ui.pattern-ok', 'Bravo, tu as trouvé le motif !'),
    };
}
```

- [ ] **Step 4: Run tests** — `node --test tests/` — Expected: all passing. If `generate_SoundLetter_UsesOnlyContinuantsAndIncludesConfusable` fails, check that `letters.json` lists `v` first in `f.confusables` (it does: `["t","v"]` → first is `t`, both accepted by the test).

- [ ] **Step 5: Commit**

```bash
git add assets/gs/generators.js tests/generators.test.mjs
git commit -m "feat(gs): pure exercise generators for all GS skills

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Trace scorer (pure) and pointer filter

**Files:**
- Create: `assets/gs/trace-score.js`
- Test: `tests/trace-score.test.mjs`

**Interfaces:**
- Produces: `score(strokes, model) → { ok, coverage, outside, startOk, hint, hintKey }` (`hintKey` ∈ `'start' | 'follow' | 'inside' | ''`) where `strokes = [[x,y,pressure,pointerType], …][]` in 0..100 space and `model = { pts, dot?, bar? }`; `createPointerFilter() → { accept(pointerType) → boolean }`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/trace-score.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { score, createPointerFilter } from '../assets/gs/trace-score.js';

const model = { pts: [[20, 50], [40, 50], [60, 50], [80, 50]] };
const along = (dy = 0, from = 18) => [Array.from({ length: 40 }, (_, i) => [from + i * 1.6, 50 + dy, 0.5, 'pen'])];

describe('score', () => {
    test('score_StrokeAlongModel_IsOk', () => {
        const r = score(along(), model);
        assert.equal(r.ok, true);
        assert.ok(r.coverage >= 0.85);
    });
    test('score_StrokeStartingAtTheEnd_FailsStart', () => {
        const rev = [along()[0].slice().reverse()];
        const r = score(rev, model);
        assert.equal(r.startOk, false);
        assert.equal(r.hint, 'Pars du point vert');
        assert.equal(r.hintKey, 'start');
    });
    test('score_StrokeFarFromModel_FailsCoverage', () => {
        const r = score(along(30), model);
        assert.equal(r.ok, false);
        assert.equal(r.hint, 'Suis le chemin gris');
        assert.equal(r.hintKey, 'follow');
    });
    test('score_TooFewPoints_IsNotOkWithoutHint', () => {
        const r = score([[[20, 50, 0.5, 'pen']]], model);
        assert.equal(r.ok, false);
        assert.equal(r.hint, '');
    });
});

describe('createPointerFilter', () => {
    test('accept_TouchBeforeAnyPen_IsAccepted', () => {
        assert.equal(createPointerFilter().accept('touch'), true);
    });
    test('accept_TouchAfterPen_IsRejected', () => {
        const f = createPointerFilter();
        f.accept('pen');
        assert.equal(f.accept('touch'), false);
        assert.equal(f.accept('pen'), true);
    });
});
```

- [ ] **Step 2: Run to verify they fail** — Expected: cannot find module.

- [ ] **Step 3: Implement**

```js
// assets/gs/trace-score.js
// Pure corridor scorer. Coordinates in a 100x100 box. No DOM.

const R = 9;             // waypoint hit radius
const R_OUT = 13.5;      // beyond this from every waypoint = outside the corridor
const R_START = 12.6;

export function score(strokes, model) {
    const pts = strokes.flat();
    if (pts.length < 8) return { ok: false, coverage: 0, outside: 0, startOk: false, hint: '', hintKey: '' };
    const wp = model.pts;
    const dist = (p, w) => Math.hypot(p[0] - w[0], p[1] - w[1]);
    const hit = wp.filter(w => pts.some(p => dist(p, w) < R)).length;
    const outside = pts.filter(p => !wp.some(w => dist(p, w) < R_OUT)).length / pts.length;
    const coverage = hit / wp.length;
    const startOk = dist(pts[0], wp[0]) < R_START;
    const ok = coverage >= 0.85 && outside < 0.25 && startOk;
    const HINTS = { start: 'Pars du point vert', follow: 'Suis le chemin gris', inside: 'Presque ! Reste dans le chemin' };
    const hintKey = ok ? '' : !startOk ? 'start' : coverage < 0.85 ? 'follow' : 'inside';
    return { ok, coverage, outside, startOk, hint: HINTS[hintKey] ?? '', hintKey };
}

export function createPointerFilter() {
    let penSeen = false;
    return {
        accept(pointerType) {
            if (pointerType === 'pen') { penSeen = true; return true; }
            if (pointerType === 'touch') return !penSeen;
            return true; // mouse
        },
    };
}
```

- [ ] **Step 4: Run tests** — Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add assets/gs/trace-score.js tests/trace-score.test.mjs
git commit -m "feat(gs): pure trace corridor scorer and pen/touch filter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Trace canvas renderer

**Files:**
- Create: `assets/gs/trace.js`
- Manual test: `gs.html` (Task 10) → exercise "trace"

**Interfaces:**
- Consumes: `score`, `createPointerFilter` from `trace-score.js`.
- Produces: `mountTrace(container, model, { onResult }) → { reset(), destroy() }`; `onResult(result)` called after each `pointerup` with the scorer result.

- [ ] **Step 1: Implement**

```js
// assets/gs/trace.js
// Two canvases: model (grid, grey corridor, start dot, arrows) and ink. Pointer Events, Pencil pressure.
import { score, createPointerFilter } from './trace-score.js';

export function mountTrace(container, model, { onResult }) {
    container.innerHTML = '<canvas class="trace-model"></canvas><canvas class="trace-ink"></canvas>';
    const [cm, ci] = container.querySelectorAll('canvas');
    const filter = createPointerFilter();
    let W = 300, strokes = [], drawing = false, mctx, ictx;

    function size() {
        const r = container.getBoundingClientRect();
        W = Math.max(200, Math.round(Math.min(r.width, r.height)));
        for (const c of [cm, ci]) { c.width = W * 2; c.height = W * 2; }
        mctx = cm.getContext('2d'); ictx = ci.getContext('2d');
        mctx.setTransform(2, 0, 0, 2, 0, 0); ictx.setTransform(2, 0, 0, 2, 0, 0);
    }

    function drawModel() {
        const s = W / 100;
        mctx.clearRect(0, 0, W, W);
        mctx.strokeStyle = '#dfe7f2'; mctx.lineWidth = 1;
        for (const y of [30, 50, 70]) { mctx.beginPath(); mctx.moveTo(0, y * s); mctx.lineTo(W, y * s); mctx.stroke(); }
        const path = (pts, width, color) => {
            mctx.strokeStyle = color; mctx.lineWidth = width * s; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
            mctx.beginPath(); mctx.moveTo(pts[0][0] * s, pts[0][1] * s);
            for (const [x, y] of pts.slice(1)) mctx.lineTo(x * s, y * s);
            mctx.stroke();
        };
        path(model.pts, 3.5, '#b9c6d9');
        if (model.bar) path(model.bar, 3.5, '#b9c6d9');
        if (model.dot) { mctx.fillStyle = '#b9c6d9'; mctx.beginPath(); mctx.arc(model.dot[0] * s, model.dot[1] * s, 3 * s, 0, 7); mctx.fill(); }
        mctx.fillStyle = '#8fa3c2';
        for (let i = 3; i < model.pts.length; i += 4) {
            const [a, b] = [model.pts[i - 1], model.pts[i]];
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
            mctx.save(); mctx.translate(b[0] * s, b[1] * s); mctx.rotate(ang);
            mctx.beginPath(); mctx.moveTo(0, 0); mctx.lineTo(-2.2 * s, -1.6 * s); mctx.lineTo(-2.2 * s, 1.6 * s); mctx.closePath(); mctx.fill(); mctx.restore();
        }
        mctx.fillStyle = '#4cb944'; mctx.beginPath(); mctx.arc(model.pts[0][0] * s, model.pts[0][1] * s, 3.2 * s, 0, 7); mctx.fill();
    }

    const pos = (e) => { const r = ci.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100, e.pressure || 0.5, e.pointerType]; };

    function down(e) {
        if (!filter.accept(e.pointerType)) return;
        e.preventDefault(); drawing = true; ci.setPointerCapture(e.pointerId); strokes.push([pos(e)]);
    }
    function move(e) {
        if (!drawing || !filter.accept(e.pointerType)) return;
        e.preventDefault();
        const p = pos(e), st = strokes[strokes.length - 1], q = st[st.length - 1];
        st.push(p);
        const s = W / 100;
        ictx.strokeStyle = '#223252'; ictx.lineCap = 'round';
        ictx.lineWidth = (p[3] === 'pen' ? 2 + p[2] * 6 : 5) * s / 2.2;
        ictx.beginPath(); ictx.moveTo(q[0] * s, q[1] * s); ictx.lineTo(p[0] * s, p[1] * s); ictx.stroke();
    }
    function up() {
        if (!drawing) return;
        drawing = false;
        onResult(score(strokes, model));
    }

    function reset() { strokes = []; ictx.clearRect(0, 0, W, W); drawModel(); }
    const onResize = () => { size(); reset(); };

    size(); reset();
    ci.addEventListener('pointerdown', down);
    ci.addEventListener('pointermove', move);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ci.addEventListener(ev, up);
    window.addEventListener('resize', onResize);

    return { reset, destroy() { window.removeEventListener('resize', onResize); container.innerHTML = ''; } };
}
```

- [ ] **Step 2: Commit (manual verification comes with Task 10's page)**

```bash
git add assets/gs/trace.js
git commit -m "feat(gs): canvas trace renderer with Pencil pressure and palm filter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Renderers, page shell and session flow

**Files:**
- Create: `assets/gs/renderers.js`, `assets/gs/app.js`, `assets/gs/gs.css`, `gs.html`
- Manual test: serve and run a full session.

**Interfaces:**
- Consumes: `compose` (Task 4), `record` (Task 3), `createSpeech/createDeviceSource/createClipSource/SILENT_SOURCE` (Task 5), `loadDecks/expandCards` (Task 6), `generate/generatePattern` (Task 7), `mountTrace` (Task 9), storage accessors (Task 2), `celebrate` from `assets/celebration.js`.
- Produces: `renderExercise(root, exercise, { speak, parentMode }) → Promise<{ correctFirstTry, attempts, ms }>`; resolves only after the success cue finished playing.

- [ ] **Step 1: Write `gs.html`** (same Bootstrap CDN + SRI as `index.html`)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Mon école à la maison</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"
        integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM" crossorigin="anonymous">
    <link rel="stylesheet" href="assets/quiz.css">
    <link rel="stylesheet" href="assets/gs/gs.css">
</head>
<body class="gs">
    <main id="app" class="gs-app" aria-live="polite">
        <section id="home" class="gs-screen">
            <header class="gs-top"><a class="gs-icon" href="index.html" aria-label="Changer de profil" id="avatar">🦊</a><span class="gs-pill">Aujourd'hui</span><a class="gs-icon" href="#parent" id="parentBtn" aria-label="Coin des parents">⚙️</a></header>
            <h1 id="hello">Salut !</h1>
            <div class="gs-hero">🌟</div>
            <div class="gs-today" id="today"></div>
            <button class="gs-cta" id="play">▶ Jouer</button>
        </section>
        <section id="exercise" class="gs-screen visually-hidden">
            <header class="gs-top"><span class="gs-pill" id="counter"></span><button class="gs-icon" id="quit" aria-label="Arrêter">✖</button></header>
            <div class="gs-progress" id="progress"></div>
            <div class="gs-consigne"><button class="gs-speak" id="replay" aria-label="Répéter la consigne">🔊</button><span id="consigne"></span></div>
            <div class="gs-stage" id="stage"></div>
            <div class="gs-choices" id="choices"></div>
            <div class="gs-feedback" id="feedback" role="status"></div>
        </section>
        <section id="done" class="gs-screen visually-hidden">
            <h1 id="doneTitle">Bravo !</h1>
            <div class="gs-hero">🦊🎉</div>
            <div class="gs-stars" id="stars"></div>
            <p class="gs-muted" id="tomorrow"></p>
            <a class="gs-cta" href="gs.html">🏠 Retour</a>
        </section>
        <section id="parent" class="gs-screen visually-hidden"></section>
    </main>
    <div id="celebration" class="celebration visually-hidden"><div>Bravo !</div></div>
    <div id="confetti" class="confetti"></div>
    <script type="module" src="assets/gs/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `assets/gs/gs.css`** (tiles ≥ 56 px, trace box, big CTA; keep Bootstrap for the rest)

```css
/* GS track: big tap targets, no reading required. */
.gs { background: #e9f2fb; color: #223252; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.gs-app { max-width: 480px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; padding: 12px max(16px, env(safe-area-inset-left)) 20px max(16px, env(safe-area-inset-right)); box-sizing: border-box; }
.gs-screen { display: flex; flex-direction: column; gap: 12px; flex: 1; }
.gs-top { display: flex; justify-content: space-between; align-items: center; }
.gs-icon { border: 0; background: #f4f8fd; width: 44px; height: 44px; border-radius: 50%; font-size: 22px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; color: inherit; }
.gs-pill { color: #6b7a99; font-weight: 600; }
.gs h1 { font-size: 30px; font-weight: 700; margin: 0; }
.gs-hero { font-size: 84px; text-align: center; line-height: 1; }
.gs-today { background: #f4f8fd; border-radius: 22px; padding: 14px 16px; display: grid; gap: 8px; }
.gs-today div { display: flex; justify-content: space-between; }
.gs-cta { border: 0; background: #4cb944; color: #fff; font-size: 24px; font-weight: 700; border-radius: 999px; padding: 16px 28px; box-shadow: 0 6px 0 #2f8f2a; text-align: center; text-decoration: none; margin-top: auto; }
.gs-cta:active { transform: translateY(3px); box-shadow: 0 3px 0 #2f8f2a; }
.gs-progress { display: flex; gap: 6px; } .gs-progress i { flex: 1; height: 8px; border-radius: 4px; background: #d7e2f0; } .gs-progress i.done { background: #4cb944; } .gs-progress i.now { background: #ffb703; }
.gs-consigne { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 600; min-height: 56px; }
.gs-speak { border: 0; background: #ffb703; color: #4a3400; width: 56px; height: 56px; border-radius: 50%; font-size: 26px; flex: none; box-shadow: 0 4px 0 #d79600; }
.gs-speak.pulse { animation: gs-pulse 1.4s ease; }
@keyframes gs-pulse { 30% { transform: scale(1.18); } 60% { transform: scale(1); } 80% { transform: scale(1.12); } }
.gs-stage { text-align: center; font-size: 72px; line-height: 1.1; min-height: 60px; }
.gs-stage .tile { display: inline-flex; width: 64px; height: 64px; align-items: center; justify-content: center; background: #f4f8fd; border: 3px solid #d7e2f0; border-radius: 16px; font-size: 40px; margin: 0 6px; }
.gs-stage .plus { font-size: 40px; vertical-align: middle; }
.gs-collection { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; font-size: 40px; padding: 12px; background: #f4f8fd; border-radius: 22px; border: 2px dashed #d7e2f0; }
.gs-collection.scattered span { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); display: inline-block; }
.gs-seq { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; font-size: 36px; }
.gs-seq span { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: #f4f8fd; border-radius: 14px; border: 2px solid #d7e2f0; }
.gs-seq span.blank { border: 3px dashed #ffb703; background: transparent; }
.gs-choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.gs-choices.two { grid-template-columns: repeat(2, 1fr); } .gs-choices.six { grid-template-columns: repeat(6, 1fr); }
.gs-choice { border: 3px solid #d7e2f0; background: #f4f8fd; border-radius: 22px; min-height: 56px; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 700; color: inherit; touch-action: manipulation; padding: 4px; }
.gs-choice.digit { font-size: 30px; aspect-ratio: auto; height: 56px; border-radius: 14px; }
.gs-choice.cursive { font-family: "Marelle", "Apple Chancery", cursive; font-style: italic; }
.gs-choice.cap { font-family: system-ui, sans-serif; } .gs-choice.script { font-family: Georgia, serif; font-weight: 400; }
.gs-choice.ok { border-color: #4cb944; background: #e6f6e3; }
.gs-choice.ko { border-color: #ef6f6c; background: #fde8e7; animation: gs-shake .35s; }
@keyframes gs-shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.gs-choice .coll { font-size: 30px; line-height: 1.1; }
.gs-dots { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.gs-dot { width: 56px; height: 56px; border-radius: 50%; border: 3px solid #d7e2f0; background: #f4f8fd; }
.gs-dot.on { background: #ffb703; border-color: #d79600; }
.gs-slots { display: flex; gap: 8px; justify-content: center; }
.gs-slots span { width: 58px; height: 58px; border: 3px dashed #d7e2f0; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; }
.gs-slots span.filled { border-style: solid; border-color: #4cb944; background: #e6f6e3; }
.gs-trace { position: relative; background: #fff; border: 3px solid #d7e2f0; border-radius: 22px; overflow: hidden; touch-action: none; aspect-ratio: 1; width: 100%; max-width: 360px; margin: 0 auto; }
.gs-trace canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.gs-feedback { text-align: center; font-weight: 600; font-size: 20px; min-height: 28px; color: #6b7a99; }
.gs-muted { color: #6b7a99; text-align: center; }
.gs-stars { font-size: 28px; text-align: center; letter-spacing: 2px; }
body.gs.silent .gs-speak { display: none; }
body.gs.silent .gs-consigne { background: #f4f8fd; border-radius: 14px; padding: 10px 12px; }
body.gs.silent .gs-consigne span::before { content: "👩‍🏫 À lire : "; display: block; color: #6b7a99; font-size: 14px; }
@media (prefers-reduced-motion: reduce) { .gs-choice.ko, .gs-speak.pulse { animation: none; } }
```

- [ ] **Step 3: Write `assets/gs/renderers.js`**

```js
// assets/gs/renderers.js
// Turns an exercise object into DOM and resolves with the result once the success cue has been played.
import { mountTrace } from './trace.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function renderStage(stage, stageEl) {
    stageEl.innerHTML = '';
    if (!stage) return;
    if (stage.emoji) stageEl.append(el('div', '', stage.emoji));
    if (stage.text && !stage.emoji) stageEl.append(el('div', 'fs-3 fw-bold', stage.text));
    if (stage.html) stageEl.append(el('div', '', stage.html));
    if (stage.collection) {
        const c = el('div', `gs-collection${stage.scattered ? ' scattered' : ''}`);
        for (const e of stage.collection) {
            const s = el('span', '', e);
            if (stage.scattered) { s.style.setProperty('--dx', `${(Math.random() - .5) * 12}px`); s.style.setProperty('--dy', `${(Math.random() - .5) * 12}px`); s.style.setProperty('--rot', `${(Math.random() - .5) * 30}deg`); }
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

function choiceButton(c) {
    const b = el('button', `gs-choice ${c.style ?? ''}`);
    b.type = 'button'; b.dataset.id = c.id;
    if (c.collection) b.innerHTML = `<span class="coll">${c.collection.join('')}</span>`;
    else b.textContent = c.emoji ?? c.label;
    b.setAttribute('aria-label', c.label);
    return b;
}

function wirePressToSay(btn, say, speak) {
    let t;
    btn.addEventListener('pointerdown', () => { t = setTimeout(() => { btn.dataset.held = '1'; speak(say); }, 450); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => clearTimeout(t));
}

export function renderExercise(root, ex, { speak, parentMode = false }) {
    const { stage, choices, feedback } = root;
    const t0 = Date.now();
    let attempts = 0;
    renderStage(ex.stage, stage);
    choices.innerHTML = ''; choices.className = 'gs-choices';
    feedback.textContent = '';

    const finish = (resolve) => async () => {
        feedback.textContent = `⭐ ${ex.success.text}`;
        await speak(ex.success);
        await sleep(400);
        resolve({ correctFirstTry: attempts === 1, attempts, ms: Date.now() - t0 });
    };

    return new Promise(resolve => {
        const done = finish(resolve);

        if (ex.layout === 'tap' || ex.layout === 'multitap') {
            if (choices && ex.choices.length === 2) choices.classList.add('two');
            if (ex.choices.length === 6 && ex.layout === 'tap') choices.classList.add('six');
            const remaining = new Set(ex.choices.filter(c => c.correct).map(c => c.id));
            for (const c of ex.choices) {
                const b = choiceButton(c);
                wirePressToSay(b, c.say, speak);
                b.addEventListener('click', async () => {
                    if (b.dataset.held) { delete b.dataset.held; return; }
                    if (b.disabled) return;
                    attempts++;
                    if (c.correct) {
                        b.classList.add('ok'); b.disabled = true; remaining.delete(c.id);
                        if (remaining.size === 0) { done(); } else { feedback.textContent = `Encore ${remaining.size}`; speak({ key: `ui.more.${remaining.size}`, text: `Encore ${remaining.size}` }); }
                    } else {
                        b.classList.add('ko'); feedback.textContent = 'Essaie encore…';
                        await speak(ex.layout === 'multitap' ? c.say : { key: 'ui.try-again', text: 'Essaie encore' });
                        b.classList.remove('ko');
                        if (attempts >= 2 && !parentMode) { // second miss: reveal, no third attempt
                            const ok = [...choices.children].find(x => ex.choices.find(c => c.id === x.dataset.id)?.correct && !x.disabled);
                            if (ok) { ok.classList.add('ok'); ok.disabled = true; remaining.delete(ok.dataset.id); if (remaining.size === 0) done(); }
                        } else { b.style.visibility = 'hidden'; setTimeout(() => { b.style.visibility = ''; }, 4000); }
                    }
                });
                choices.append(b);
            }
        }

        if (ex.layout === 'dots') {
            const dots = el('div', 'gs-dots');
            for (let i = 0; i < ex.total; i++) {
                const d = el('button', `gs-dot${i < ex.lit ? ' on' : ''}`); d.type = 'button';
                if (i >= ex.lit) d.addEventListener('click', () => d.classList.toggle('on'));
                dots.append(d);
            }
            const cta = el('button', 'gs-cta', 'C\'est bon !'); cta.type = 'button';
            cta.addEventListener('click', async () => {
                attempts++;
                const n = dots.querySelectorAll('.on').length;
                if (n === ex.target) { cta.disabled = true; done(); }
                else { const msg = n < ex.target ? 'Il en manque…' : 'Il y en a trop…'; feedback.textContent = msg; await speak({ key: n < ex.target ? 'ui.missing' : 'ui.too-many', text: msg }); }
            });
            choices.append(dots, cta);
        }

        if (ex.layout === 'slots') {
            const slots = el('div', 'gs-slots'); const pool = el('div', 'gs-choices');
            const want = [...ex.answer]; let typed = '';
            want.forEach(() => slots.append(el('span')));
            for (const c of ex.choices) {
                const b = choiceButton(c); wirePressToSay(b, c.say, speak);
                b.addEventListener('click', async () => {
                    if (b.dataset.held) { delete b.dataset.held; return; }
                    attempts++;
                    if (want[typed.length] === c.label) {
                        typed += c.label; b.style.visibility = 'hidden';
                        const s = slots.children[typed.length - 1]; s.textContent = c.label; s.classList.add('filled');
                        speak(c.say);
                        if (typed === ex.answer) { attempts = Math.max(1, attempts - want.length + 1); done(); }
                    } else { b.classList.add('ko'); await speak({ key: 'ui.not-that-one', text: 'Pas celle-là' }); b.classList.remove('ko'); }
                });
                pool.append(b);
            }
            choices.append(slots, pool);
        }

        if (ex.layout === 'trace') {
            const box = el('div', 'gs-trace');
            const bar = el('div', 'd-flex justify-content-between align-items-center gap-2');
            const resetBtn = el('button', 'btn btn-light rounded-pill', '↺ Recommencer'); resetBtn.type = 'button';
            bar.append(resetBtn);
            choices.append(box, bar);
            let solved = false;
            const t = mountTrace(box, ex.trace, { onResult: async (r) => {
                if (solved) return;
                attempts++;
                if (r.ok) { solved = true; done(); }
                else { feedback.textContent = r.hint; if (r.hintKey) speak({ key: `ui.trace-hint.${r.hintKey}`, text: r.hint }); }
            } });
            resetBtn.addEventListener('click', () => { t.reset(); feedback.textContent = ''; });
        }
    });
}
```

- [ ] **Step 4: Write `assets/gs/app.js`**

```js
// assets/gs/app.js
// Session flow for gs.html: Home → 6 exercises → Done. Profile is captured at session start.
import { getActiveProfileId, loadProfiles, loadSettings, loadSrs, saveSrs, appendSession } from '../storage.js';
import { record, dueCards, boxCounts } from '../core/scheduler.js';
import { compose } from '../core/session.js';
import { createSpeech, createDeviceSource, createClipSource, SILENT_SOURCE } from '../core/speech.js';
import { celebrate } from '../celebration.js';
import { loadDecks, expandCards } from './decks/index.js';
import { generate, generatePattern } from './generators.js';
import { renderExercise } from './renderers.js';
import { mountParent } from './parent.js';

const today = () => new Date().toISOString().slice(0, 10);
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.gs-screen')) s.classList.toggle('visually-hidden', s.id !== id); };

const profileId = getActiveProfileId();
const profile = loadProfiles().find(p => p.id === profileId) ?? { id: profileId, name: '', avatar: '🦊' };
const settings = loadSettings(profileId);
const decks = await loadDecks();
const cards = expandCards(decks, { firstName: settings.firstName });

let manifest = new Set();
try { manifest = new Set(await (await fetch('assets/audio/gs/manifest.json')).json()); } catch { /* no clips yet */ }
const device = createDeviceSource({ preferredVoice: settings.voice });
const speech = createSpeech({ sources: [createClipSource({ baseUrl: 'assets/audio/gs', manifest }), device, SILENT_SOURCE] });
speech.setSource(settings.audio);
document.body.classList.toggle('silent', settings.audio === 'silent');

function renderHome() {
    const srs = loadSrs(profileId, 'gs');
    const due = dueCards(srs, today()).length;
    $('avatar').textContent = profile.avatar;
    $('hello').textContent = profile.name ? `Salut ${profile.name} !` : 'Salut !';
    const counts = boxCounts(srs);
    $('today').innerHTML = `
        <div><span>⏱️ Ta partie du jour</span><b>${settings.sessionItems} jeux · ~${settings.sessionItems} min</b></div>
        <div><span>📚 À revoir</span><b>${due}</b></div>
        <div><span>📦 Boîtes</span><b>${counts.join(' · ')}</b></div>`;
}

async function runSession() {
    const sessionProfileId = profileId; // captured: a profile switch mid-session must not leak
    let srs = loadSrs(sessionProfileId, 'gs');
    const day = today();
    const { slots, introduced } = compose({ srs, cards, today: day, constraints: { items: settings.sessionItems, traceSlots: [2, 3], maxNumbers: 2, newPerDay: { letters: 2, words: 3, numbers: 1, name: 1 } } });
    srs = { ...srs, introduced: { ...srs.introduced, [day]: [...(srs.introduced[day] ?? []), ...introduced] } };
    saveSrs(sessionProfileId, 'gs', srs);

    const exercises = slots.map(c => generate(c, { cards }));
    if (exercises.length < settings.sessionItems) exercises.push(generatePattern());
    const items = [];
    const t0 = Date.now();
    show('exercise');
    await speech.speak({ key: 'ui.lets-go', text: 'C\'est parti !' });

    for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        $('counter').textContent = `Jeu ${i + 1}/${exercises.length}`;
        $('progress').innerHTML = exercises.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`).join('');
        $('consigne').textContent = ex.prompt.text;
        const replay = $('replay');
        replay.onclick = () => speech.speak(ex.prompt);
        setTimeout(() => { replay.classList.remove('pulse'); void replay.offsetWidth; replay.classList.add('pulse'); speech.speak(ex.prompt); }, 350);
        const result = await renderExercise({ stage: $('stage'), choices: $('choices'), feedback: $('feedback') }, ex, { speak: speech.speak, parentMode: settings.parentMode });
        items.push({ cardId: ex.cardId, type: ex.type, ...result });
        if (ex.cardId) { srs = record(srs, ex.cardId, result.correctFirstTry, day); saveSrs(sessionProfileId, 'gs', srs); }
    }

    appendSession(sessionProfileId, 'gs', { date: new Date().toISOString(), items, durationMs: Date.now() - t0 });
    show('done');
    $('doneTitle').textContent = profile.name ? `Bravo ${profile.name} !` : 'Bravo !';
    $('stars').textContent = '⭐'.repeat(items.filter(x => x.correctFirstTry).length) + '☆'.repeat(items.filter(x => !x.correctFirstTry).length);
    const next = dueCards(srs, today()).length;
    $('tomorrow').textContent = next ? `On se revoit demain !` : `Tout est révisé, à demain !`;
    celebrate({ duration: 3000, pieces: 80 });
    speech.speak({ key: 'ui.done', text: `Bravo ! ${items.length} jeux, c'est fini pour aujourd'hui.` });
}

$('play').addEventListener('click', () => runSession().catch(err => { console.error(err); alert('Oups, quelque chose n\'a pas marché. Recharge la page.'); }));
$('quit').addEventListener('click', () => { speech.stop(); location.href = 'gs.html'; });
$('parentBtn').addEventListener('click', (e) => { e.preventDefault(); show('parent'); mountParent($('parent'), { profileId, settings, cards, device, speech, onBack: () => { show('home'); renderHome(); } }); });

renderHome();
show('home');
```

- [ ] **Step 5: Create a minimal `assets/gs/parent.js` stub so the page loads (Task 11 fills it)**

```js
// assets/gs/parent.js
export function mountParent(root, { onBack }) {
    root.innerHTML = '<button class="gs-icon" id="parentBack">‹</button><p class="gs-muted">Coin des parents (bientôt)</p>';
    root.querySelector('#parentBack').addEventListener('click', onBack);
}
```

- [ ] **Step 6: Manual test** — `python3 -m http.server 8000` in the worktree, open `http://localhost:8000/gs.html`:
  - Home shows "Salut !" and the counters; tap Jouer; "C'est parti !" plays, then each exercise's consigne plays once and 🔊 replays it.
  - Walk a full session; wrong tap shakes and hides, second miss reveals; the success cue finishes before the next screen.
  - Trace: draw the letter with the mouse; "Pars du point vert" when starting elsewhere; success advances.
  - Done screen: stars, confetti, message spoken. Reload: Home "À revoir" reflects due cards; `node --test tests/` still green.
  - DevTools → Application → localStorage shows `school.v1.srs.default.gs` and `school.v1.sessions.default.gs`.

- [ ] **Step 7: Commit**

```bash
git add gs.html assets/gs/gs.css assets/gs/renderers.js assets/gs/app.js assets/gs/parent.js
git commit -m "feat(gs): page shell, renderers and session flow

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Parent corner

**Files:**
- Modify: `assets/gs/parent.js`

**Interfaces:**
- Consumes: `loadSettings/saveSettings/loadSrs/loadSessions` (Task 2), `boxCounts` (Task 3), `device.listVoices()/setPreferred()` and `speech.setSource()/speak()` (Task 5).

- [ ] **Step 1: Implement**

```js
// assets/gs/parent.js
import { saveSettings, loadSrs, loadSessions } from '../storage.js';
import { boxCounts } from '../core/scheduler.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountParent(root, { profileId, settings, cards, device, speech, onBack }) {
    const srs = loadSrs(profileId, 'gs');
    const sessions = loadSessions(profileId, 'gs');
    const week = sessions.filter(s => Date.now() - new Date(s.date) < 7 * 864e5);
    const items = week.flatMap(s => s.items);
    const firstTry = items.length ? Math.round(100 * items.filter(i => i.correctFirstTry).length / items.length) : 0;
    const lapses = Object.entries(srs.cards).filter(([, c]) => c.lapses >= 2).map(([id]) => id).slice(0, 5);
    const voices = device.listVoices();
    const decks = [...new Map(cards.map(c => [c.deckId, c.deck])).values()];

    root.innerHTML = `
      <header class="gs-top"><button class="gs-icon" id="parentBack" aria-label="Retour">‹</button><span class="gs-pill">Coin des parents</span><span></span></header>
      <div class="card p-3 mb-2"><h3 class="h6">Réglages</h3>
        <label class="form-label">Prénom de l'enfant <input class="form-control" id="firstName" value="${esc(settings.firstName)}"></label>
        <label class="form-label">Nombre de jeux par partie
          <select class="form-select" id="sessionItems">${[5, 6, 7, 8].map(n => `<option ${n === settings.sessionItems ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="parentMode" ${settings.parentMode ? 'checked' : ''}><label class="form-check-label" for="parentMode">Mode accompagné (un adulte est à côté : pas de réponse révélée automatiquement)</label></div>
      </div>
      <div class="card p-3 mb-2"><h3 class="h6">Source audio</h3>
        ${[['clips', 'Clips enregistrés'], ['device', 'Voix de l\'appareil'], ['silent', 'Aucune voix : un adulte lit les consignes']].map(([v, l]) =>
            `<div class="form-check"><input class="form-check-input" type="radio" name="audio" id="audio-${v}" value="${v}" ${settings.audio === v ? 'checked' : ''}><label class="form-check-label" for="audio-${v}">${l}</label></div>`).join('')}
        <label class="form-label mt-2">Voix <select class="form-select" id="voice">${voices.length ? voices.map(v => `<option value="${esc(v.name)}" ${v.name === settings.voice ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('') : '<option value="">Aucune voix française sur cet appareil</option>'}</select></label>
        <button class="btn btn-warning rounded-pill" id="testVoice">🔊 Tester</button>
        <p class="small text-muted mt-2">Voix robotique ? Sur iPad : Réglages › Accessibilité › Contenu énoncé › Voix › Français › télécharger une voix « Premium ». Sur Mac : Réglages Système › Accessibilité › Contenu énoncé › Gérer les voix.</p>
      </div>
      <div class="card p-3 mb-2"><h3 class="h6">Boîtes de Leitner</h3>
        <div class="d-flex justify-content-between text-center">${boxCounts(srs).map((n, i) => `<div><b class="fs-4">${n}</b><br><small class="text-muted">${['1 j', '2 j', '4 j', '1 sem', '1 sem'][i]}</small></div>`).join('')}</div>
      </div>
      <div class="card p-3 mb-2"><h3 class="h6">Decks</h3>${decks.map(d => `<div>${esc(d.label)} <span class="badge text-bg-light">${d.items.length}</span></div>`).join('')}</div>
      <div class="card p-3 mb-2"><h3 class="h6">Cette semaine</h3>
        <div>${week.length} parties · ${items.length} jeux · ${firstTry} % du premier coup</div>
        ${lapses.length ? `<div>À surveiller : ${lapses.map(esc).join(', ')}</div>` : ''}
      </div>`;

    root.querySelector('#parentBack').addEventListener('click', onBack);
    const save = (patch) => Object.assign(settings, saveSettings(profileId, patch));
    root.querySelector('#firstName').addEventListener('change', e => save({ firstName: e.target.value.trim() }));
    root.querySelector('#sessionItems').addEventListener('change', e => save({ sessionItems: Number(e.target.value) }));
    root.querySelector('#parentMode').addEventListener('change', e => save({ parentMode: e.target.checked }));
    for (const r of root.querySelectorAll('input[name=audio]')) r.addEventListener('change', e => { save({ audio: e.target.value }); speech.setSource(e.target.value); document.body.classList.toggle('silent', e.target.value === 'silent'); });
    root.querySelector('#voice').addEventListener('change', e => { save({ voice: e.target.value }); device.setPreferred(e.target.value); });
    root.querySelector('#testVoice').addEventListener('click', () => speech.speak({ key: 'ui.test', text: 'Bonjour ! Quel mot commence comme lapin ?' }));
}
```

- [ ] **Step 2: Manual test** — open the parent corner: change first name → reload → name-spell card appears in a later session (check `school.v1.settings.<profileId>`); switch to "Aucune voix" → consignes show "À lire" and no autoplay; switch voice → Tester uses it.

- [ ] **Step 3: Commit**

```bash
git add assets/gs/parent.js
git commit -m "feat(gs): parent corner with settings, audio source and Leitner view

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Profile picker on `index.html`

**Files:**
- Modify: `index.html` (replace the `<body>`)
- Create: `assets/profiles.js`

**Interfaces:**
- Consumes: `loadProfiles/saveProfiles/setActiveProfileId/getActiveProfileId` (Task 2).
- Behaviour: no profiles stored → seed two cards with placeholder names editable in the page ("Enfant 1 · Grande Section", "Enfant 2 · 6ème"); tapping a card sets the active profile and opens `gs.html` for `track: 'gs'`, `index.html#math` list for anything else until the 6ème page exists. Math quiz links stay reachable under "Autres jeux".

- [ ] **Step 1: Write `assets/profiles.js`**

```js
// assets/profiles.js
import { loadProfiles, saveProfiles, setActiveProfileId } from './storage.js';

const DEFAULTS = [
    { id: 'kid-gs', name: 'Grande Section', avatar: '🦊', track: 'gs' },
    { id: 'kid-6e', name: '6ème', avatar: '🐼', track: 'en' },
];
const TARGET = { gs: 'gs.html', en: 'multiplication.html' }; // 'en' points at the math quizzes until the 6ème track ships

export function mountProfiles(root) {
    let profiles = loadProfiles();
    if (profiles.length === 0) { profiles = DEFAULTS; saveProfiles(profiles); }
    root.innerHTML = profiles.map(p => `
        <button class="avatar" data-id="${p.id}"><span class="face">${p.avatar}</span><b>${p.name}</b></button>`).join('');
    root.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-id]'); if (!b) return;
        const p = profiles.find(x => x.id === b.dataset.id);
        setActiveProfileId(p.id);
        location.href = TARGET[p.track] ?? 'index.html';
    });
}
```

- [ ] **Step 2: Replace the `<body>` of `index.html`**

```html
<body class="bg-light">
    <div class="container my-5" style="max-width:480px">
        <h1 class="mb-3">Qui joue ?</h1>
        <div id="profiles" class="d-grid gap-3" style="grid-template-columns:1fr 1fr"></div>
        <details class="mt-4"><summary>Autres jeux</summary>
            <ul class="mt-2"><li><a href="multiplication.html">Multiplication</a></li><li><a href="addition.html">Addition</a></li></ul>
        </details>
    </div>
    <style>
        .avatar{border:3px solid #d7e2f0;background:#f4f8fd;border-radius:28px;padding:18px 10px;text-align:center;color:#223252}
        .avatar .face{font-size:64px;display:block}.avatar b{display:block;font-size:20px;margin-top:6px}
    </style>
    <script type="module">
        import { mountProfiles } from './assets/profiles.js';
        mountProfiles(document.getElementById('profiles'));
    </script>
</body>
```

- [ ] **Step 3: Manual test** — open `/`: two cards; tap the fox → `gs.html` greets with the profile name; `school.v1.activeProfileId` = `kid-gs`; math quizzes still work from "Autres jeux" and save history under the active profile.

- [ ] **Step 4: Commit**

```bash
git add index.html assets/profiles.js
git commit -m "feat(core): profile picker on the landing page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Audio clips generation (primary audio)

**Files:**
- Create: `tools/gen-audio.mjs`, `tools/README.md`
- Output: `assets/audio/gs/**.mp3`, `assets/audio/gs/manifest.json`
- Test: `tests/audio-cues.test.mjs` (every cue key the generators can emit for the shipped decks is listed by the tool)

**Interfaces:**
- Consumes: `generate()` cue keys (`prompt.key`, `success.key`, `choices[].say.key`) and the fixed `ui.*`, `num.*`, `letter.*.name`, `word.*`, `syl.*` keys.
- Produces: `collectCues(decks, cards) → Map<key, text>` exported from `tools/cues.mjs`; `manifest.json` = array of keys that have an mp3.

- [ ] **Step 1: Write `tools/cues.mjs`**

```js
// tools/cues.mjs — enumerate every cue (key → text) the GS track can ask for, so clips can be generated once.
import { generate } from '../assets/gs/generators.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

export function collectCues(cards) {
    const cues = new Map();
    const add = (c) => { if (c?.key) cues.set(c.key, c.text); };
    // Run each generator with several rngs so every branch of distractor choice is visited.
    for (const card of cards) for (const r of [0.05, 0.3, 0.55, 0.8, 0.99]) {
        const ex = generate(card, { cards, rng: seq(r, (r + 0.37) % 1, (r + 0.71) % 1) });
        add(ex.prompt); add(ex.success);
        for (const c of ex.choices ?? []) add(c.say);
        if (ex.trace) add(ex.trace.say);
    }
    const fixed = {
        'ui.lets-go': 'C\'est parti !', 'ui.done': 'Bravo ! C\'est fini pour aujourd\'hui.', 'ui.try-again': 'Essaie encore',
        'ui.not-that-one': 'Pas celle-là', 'ui.missing': 'Il en manque…', 'ui.too-many': 'Il y en a trop…', 'ui.this-one': 'celui-là',
        'ui.more.1': 'Encore 1', 'ui.more.2': 'Encore 2', 'ui.pattern': 'Regarde bien. Qu\'est-ce qui vient après ?', 'ui.pattern-ok': 'Bravo, tu as trouvé le motif !',
        'ui.count': 'Combien y en a-t-il ?', 'ui.compare': 'Où y a-t-il le plus ?', 'ui.number-line': 'Quel nombre manque sur la ligne ?',
        'ui.name-spell': 'Remets les lettres de ton prénom dans l\'ordre.',
        'ui.trace-hint.start': 'Pars du point vert', 'ui.trace-hint.follow': 'Suis le chemin gris', 'ui.trace-hint.inside': 'Presque ! Reste dans le chemin',
        'ui.test': 'Bonjour ! Quel mot commence comme lapin ?',
    };
    for (const [k, v] of Object.entries(fixed)) cues.set(k, v);
    for (let n = 0; n <= 10; n++) cues.set(`num.${n}`, ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'][n]);
    return cues;
}
```

- [ ] **Step 2: Write the test that pins cue coverage**

```js
// tests/audio-cues.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandCards } from '../assets/gs/decks/index.js';
import { collectCues } from '../tools/cues.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];

test('collectCues_ShippedDecks_CoversWordsLettersNumbersAndUi', () => {
    const cues = collectCues(expandCards(decks, { firstName: 'Lou' }));
    for (const k of ['word.lapin', 'letter.a.name', 'num.7', 'ui.lets-go', 'ui.syll-match.lapin', 'syl.fa']) assert.ok(cues.has(k), k);
    for (const [k, v] of cues) assert.ok(v && v.length > 0, k);
});
```

Run: `node --test tests/audio-cues.test.mjs` — Expected: FAIL (module missing) then PASS after Step 1 is saved.

- [ ] **Step 3: Write `tools/gen-audio.mjs`** (macOS `say` with a Premium voice by default; `--engine openai` when `OPENAI_API_KEY` is set; converts to mp3 with `ffmpeg` if present, otherwise keeps `.m4a`/`.aiff` and the manifest records the extension)

```js
// tools/gen-audio.mjs — node tools/gen-audio.mjs [--voice "Audrey (Premium)"] [--engine say|openai] [--only key,key]
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expandCards } from '../assets/gs/decks/index.js';
import { collectCues } from './cues.mjs';

const run = promisify(execFile);
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? true] : []).filter(x => x.length));
const voice = args.voice ?? 'Audrey (Premium)';
const engine = args.engine ?? (process.env.OPENAI_API_KEY ? 'openai' : 'say');
const only = args.only ? new Set(String(args.only).split(',')) : null;
const OUT = new URL('../assets/audio/gs/', import.meta.url);

const load = async (n) => JSON.parse(await readFile(new URL(`../assets/gs/decks/${n}.json`, import.meta.url), 'utf8'));
const decks = [await load('letters'), await load('numbers'), await load('mots-p1')];
const cues = collectCues(expandCards(decks, { firstName: '' })); // first-name cues are TTS at runtime
const exists = (p) => access(p).then(() => true, () => false);
const haveFfmpeg = await run('which', ['ffmpeg']).then(() => true, () => false);

const manifest = [];
for (const [key, text] of cues) {
    if (only && !only.has(key)) continue;
    const rel = key.replaceAll('.', '/');
    const mp3 = new URL(`${rel}.mp3`, OUT);
    await mkdir(new URL('.', mp3), { recursive: true });
    if (!(await exists(mp3))) {
        if (engine === 'say') {
            const aiff = new URL(`${rel}.aiff`, OUT);
            await run('say', ['-v', voice, '-r', '160', '-o', aiff.pathname, text]);
            if (haveFfmpeg) { await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff.pathname, '-ac', '1', '-b:a', '64k', mp3.pathname]); await run('rm', [aiff.pathname]); }
            else { console.warn(`ffmpeg missing: kept ${aiff.pathname}; install ffmpeg (brew install ffmpeg) and rerun`); continue; }
        } else {
            const res = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text, response_format: 'mp3', instructions: 'Voix douce et très articulée, pour un enfant de cinq ans, en français de France.' }) });
            if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`);
            await writeFile(mp3, Buffer.from(await res.arrayBuffer()));
        }
        console.log('generated', key);
    }
    manifest.push(key);
}
await writeFile(new URL('manifest.json', OUT), JSON.stringify(manifest.sort()));
console.log(`${manifest.length} clips in manifest`);
```

- [ ] **Step 4: Write `tools/README.md`**

```markdown
# tools

`node tools/gen-audio.mjs` generates one mp3 per spoken cue of the GS track into `assets/audio/gs/`
and writes `manifest.json`. Idempotent: existing clips are kept. Options: `--voice`, `--engine say|openai`, `--only key,key`.
Default engine is macOS `say` with "Audrey (Premium)" (download it first: Réglages Système › Accessibilité › Contenu énoncé › Gérer les voix).
`ffmpeg` is required for mp3 (`brew install ffmpeg`). Re-run after adding a deck. Clips are committed; a full track is < 2 MB.
```

- [ ] **Step 5: Generate, listen, commit** — run `node tools/gen-audio.mjs`, open `gs.html`, set the audio source to "Clips enregistrés", play one session and listen to "fff" and the word clips. Check total size: `du -sh assets/audio/gs` (expected < 2 MB).

```bash
git add tools tests/audio-cues.test.mjs assets/audio/gs
git commit -m "feat(gs): pre-generated French audio clips as primary audio source

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Docs, device pass and release

**Files:**
- Modify: `ARCHITECTURE.md` (modules table, storage schema, new "Learning tracks" section with the architecture and session mermaid diagrams from the spec §5), `README.md` (how to run tests, add a deck, generate clips), `CLAUDE.md` (layout block, "Working in this repo": `node --test tests/` before pushing; storage rule unchanged).

- [ ] **Step 1: Update the three docs** — copy the two mermaid diagrams from the spec (§5 and §5.1) into `ARCHITECTURE.md`; add the storage keys table rows from spec §6.2; add to `README.md`:

```markdown
## Tests
`node --test tests/` (Node ≥ 20, no dependencies). Pure modules only; DOM parts are hand-tested.

## Grande Section track
`gs.html`. Decks in `assets/gs/decks/*.json`; add a word deck per période (`mots-p2.json`), register it in `assets/gs/decks/index.js` (`DECK_FILES`), run `node tools/gen-audio.mjs`, commit the clips.
```

- [ ] **Step 2: Device pass (iPad with Pencil, then phone)** — serve from the Mac (`python3 -m http.server 8000`, open `http://<mac-ip>:8000/gs.html` on the iPad):
  - Audio unlocks on "Jouer"; consignes autoplay; clips source selected; no cut-off between success and next consigne.
  - Trace with the Pencil: pressure varies the line; resting the palm does not draw; finger alone still draws when no Pencil was used in the session.
  - Rotate, add to Home Screen, run once full-screen.
  - Phone at 390 px: no horizontal scroll; six digit tiles fit; all tap targets ≥ 56 px (inspect).
  - Silent mode: "À lire" label shows, nothing autoplays, nothing auto-advances on the second miss when Parent mode is on.
  - Record findings in `docs/superpowers/reviews/2026-10-XX-gs-device-pass.md` (local), fix blockers, re-run `node --test tests/`.

- [ ] **Step 3: Child pass** — one real session with Parent mode on; note stalls; adjust copy only.

- [ ] **Step 4: Release** — ask the user to review the diff; on explicit approval:

```bash
git push -u origin gs-track
# open the PR on GitHub, then after approval:
git checkout main && git merge --ff-only gs-track && git push origin main
```

`main` push = deploy. Verify `https://<pages-url>/gs.html` loads, decks fetch (no 404 on `assets/gs/decks/*.json` or `manifest.json`), audio plays.

---

## Self-review notes

- Spec coverage: §2 attendus → Tasks 6–7 (decks, generators); §4 constraints → Task 4; §5 architecture → file structure + Tasks 3–5, 10; §6 data model → Tasks 2, 6; §7 catalogue → Task 7 (14 types incl. `pattern` via `generatePattern`); §8 tracing → Tasks 8–9; §9 audio sources, clips primary, sequencing → Tasks 5, 10, 13; §10 composer → Task 4; §11 screens → Tasks 10–12; §12 admin paths → Task 13 README + decks; §13 risks → Review Focus + Task 14; §14 test plan → `tests/` + Task 14.
- Review Focus coverage: (1) Task 4 `compose_NothingDueAndNoNewLeft_PadsFromHighBoxes`; (2) Task 7 `assertChoiceSet` distinct emoji/labels + long-press say in Task 10; (3) Task 5 `speak_WhenOnDoneNeverFires_ResolvesOnTimeout`; (4) Task 8 `accept_TouchAfterPen_IsRejected`; (5) Task 2 `saveSrs_UsesExplicitProfileNotActiveOne` + `sessionProfileId` capture in Task 10.
- Known gaps, deliberate: trace models exist for 10 letters and no digits in v1 (digits tracing is a follow-up deck entry); `number-line` uses a static 1–10 line; Marelle font is referenced by name only (install later as a self-hosted OFL webfont if the system cursive fallback reads badly on the iPad).
