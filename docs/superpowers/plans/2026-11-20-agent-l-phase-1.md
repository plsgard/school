# Agent L (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `agent.html`, a 3D spy game in which every lock Louis opens is a retrieval of one item of his lessons (English from the lessons already in the app, SVT chapter 3), playable on the family iPad.

**Architecture:** The game is a second front end on the English lesson engine (`assets/en/lesson-session.js` + `ladder.js`), made subject-agnostic by one optional table argument. Everything that decides something is a pure, tested module (`assets/agent/{rules,missions,world,levels}.js`, `assets/lessons/{index,qa}.js`); three.js code only draws and listens. A mission is exactly a lesson session of 10 exercises, each rendered as a lock.

**Tech Stack:** Plain ES modules, no build. three.js 0.187.0 vendored under `assets/vendor/three/`. `node --test` for pure modules. `localStorage` only through `assets/storage.js`.

**Spec:** `docs/superpowers/specs/2026-11-20-agent-l-3d-game-design.md` (read it first; this plan argues from it).

## Global Constraints

- No build step, framework or package manager; no `package.json`. No external 3D models, texture files or fonts: geometry from primitives, signs from `CanvasTexture` drawn in code.
- Work on branch `agent-l` in the worktree `.worktrees/agent-l` (add `.worktrees/` to `.git/info/exclude`). `main` is production: nothing reaches `main` before Task 11's gate and the parent's OK.
- `node --test` (repo root, no argument) is green before every commit. Test names: `<Method>_<Condition>_<Expectation>`; one test file per module.
- `assets/core/*` is not modified. `assets/en/*` changes only as Task 1 says; `en.html` must behave exactly as before (its existing tests stay untouched and green).
- Existing card ids and item ids never change (`<deckId>/<itemId>#<skill>`): the game shares `learn.<profile>.en` and `srs.<profile>.en` with `en.html`.
- French UI strings: correct French, non-breaking space before `! ? : ;`. Data text through `textContent`, never `innerHTML`.
- Typed inputs: `autocorrect`, `autocapitalize`, `autocomplete`, `spellcheck` off.
- No timer on an answer; the world is paused while a lock panel is open. A miss always ends on the model answer and never blocks. A revealed answer is never praised or paid as right.
- No weapons against people; robots are stunned. No name, character or look from an existing game.
- This repo is public: no mark, school name or photo of the child in any committed file. `inbox/` is never committed.
- iPad Safari: 60 fps target, pixel ratio ≤ 2, audio and speech unlocked inside a tap.

## Review Focus

1. **Storage blocked or full** (private mode, quota): every save is best-effort; the mission goes on and the answer still counts in memory. Test in Task 5 (`persist`).
2. **No English voice on the device**: no `hear` or `listen-pick` lock is ever offered, briefings are text only, nothing waits on speech. Tests in Task 4.
3. **A thin lesson** (a `pick` with fewer than 3 wrong choices, a `sort` group with one category, a `qa` item whose model answer fails its own keys): generators never throw; `validateLesson` reports it. Tests in Task 2.
4. **Keyboard, rotation or resize while a lock is open**: the panel stays fully visible above the iPad keyboard, the typed text and focus survive. Hand check in Task 8.
5. **App sent to the background mid-mission, or midnight passing**: the loop pauses, the mission resumes intact; the day rolls over only between missions. Test in Task 5 (`rollDay`), hand check in Task 8.

---

### Task 1: Ladder table (one engine for every subject)

**Files:**
- Modify: `assets/en/ladder.js`, `assets/en/lesson-session.js`
- Test: `tests/en-ladder-table.test.mjs` (new; existing `tests/en-ladder.test.mjs` and `tests/en-lesson-session.test.mjs` are not edited)

**Interfaces:**
- Produces, in `ladder.js` (existing exports `LEARN_KINDS`, `FORMATS`, `FAST_MS`, `SUPPORT_FORMATS` stay):
  - `EN_LADDER = { formats: FORMATS, fastMs: FAST_MS, support: SUPPORT_FORMATS, top: (kind, hasVoice) => number }` (today's `topLevel` body)
  - `learnKinds(table = EN_LADDER): string[]` → `Object.keys(table.formats)`
  - `startLevel(kind, table = EN_LADDER)` → the lowest level key of `table.formats[kind]` (spell 1, write 2, as today)
  - `topLevel(kind, hasVoice, table = EN_LADDER)`, `initial(kind, table = EN_LADDER)`, `levelOf(state, kind, top, table = EN_LADDER)`, `pickFormat(kind, state, formatStats = {}, table = EN_LADDER)`, `applyAnswer(learn, cardId, kind, opts, table = EN_LADDER)`
- Produces, in `lesson-session.js`: `nextStep({ …, table = EN_LADDER })`, `applyStep({ …, table = EN_LADDER })`, `inLearning(state, kind, top, table = EN_LADDER)`. Every internal use of `LEARN_KINDS`, `FORMATS`, `FAST_MS`, `SUPPORT_FORMATS`, `startLevel`, `topLevel` reads the table.

- [ ] **Step 1: Write the failing tests** with this table:

```js
const T = { ...EN_LADDER,
    formats: { ...EN_LADDER.formats, qa: { 1: ['pick'], 2: ['cloze'], 3: ['sentence'] } },
    top: (kind, hasVoice) => (kind === 'qa' ? 3 : EN_LADDER.top(kind, hasVoice)) };
const qaCard = { id: 'l-g/q1#answer', deckId: 'l-g', kind: 'qa', skill: 'answer', item: { id: 'q1' }, deck: { id: 'l-g', lesson: { id: 'l' } } };
const sortCard = { ...qaCard, id: 'l-s/x#sort', kind: 'sort', skill: 'sort' };
```

  - `startLevel_QaKindWithTable_Returns1`, `initial_QaKindWithTable_StartsAtLevel1`
  - `pickFormat_QaLevel1WithTable_ReturnsPick`; `pickFormat_QaLevel1PendingMiss_ReturnsPick2` (`alt: true`)
  - `applyAnswer_QaRightAtLevel1_ClimbsToLevel2` (`ms: 20000`); `applyAnswer_QaRightAtLevel3_AddsTopDay`
  - `nextStep_NewQaCardWithTable_ReturnsLevel1PickRecorded` (`index: 2, total: 10`, empty `srs`/`learn`) → `{ level: 1, format: 'pick', record: true, isNew: true }`
  - `nextStep_QaCardWithoutTable_ReturnsNonLearnStep` → `format: null` (documents the default)
  - `applyStep_QaRightAtTopWithTable_CreatesLeitnerState` → `srs.cards[qaCard.id].box === 2`
  - `applyStep_SortCardRight_RecordsLeitnerOnly` → `learn` unchanged, `srs.cards[sortCard.id]` set
  - `EN_LADDER_Defaults_MatchLegacyConstants` → `learnKinds()` deep-equals `LEARN_KINDS`
- [ ] **Step 2:** Run `node --test tests/en-ladder-table.test.mjs`. Expected: FAIL (`EN_LADDER` is not exported).
- [ ] **Step 3:** Implement the table argument. `pickFormat` keeps its `pick` → `pick2` rule for any kind.
- [ ] **Step 4:** Run `node --test`. Expected: all green, including the untouched English tests.
- [ ] **Step 5:** Serve the site (`.claude/launch.json` config `school`), open `en.html`, play one lesson session of `what-day-is-it` to the done screen; console has no error.
- [ ] **Step 6:** Commit `refactor(en): ladder kinds and formats as a table argument`. Then run the `owner-reviewer` agent on this commit alone (it touches the production English track) and fix what it finds before Task 2.

### Task 2: Lessons for other subjects (`qa`, `sort`)

**Files:**
- Create: `assets/lessons/index.js`, `assets/lessons/qa.js`, `tests/helpers/lesson-fixture.json`
- Test: `tests/lessons-index.test.mjs`, `tests/lessons-qa.test.mjs`

**Interfaces:**
- Consumes: `EN_LADDER` (Task 1); `flattenLesson` (`assets/en/decks/index.js`); `checkAnswer` (`assets/en/answer.js`).
- Produces, `index.js`:
  - `SUBJECTS = { svt: [] }` (lesson ids per subject, current lesson first; filled in Task 3)
  - `LESSON_LADDER`: `EN_LADDER` plus `qa: { 1: ['pick'], 2: ['cloze'], 3: ['sentence'] }`, `top` 3 for `qa`
  - `loadLessons(subject, fetchImpl = fetch, base = 'assets/lessons'): Promise<Deck[]>` (reads `<base>/<subject>/<id>.json`, flattens with `flattenLesson`)
  - `expandLessonCards(decks): Card[]`, same card shape as English (`{ id: '<deckId>/<itemId>#<skill>', deckId, kind, skill, item, deck }`); skill `answer` for `qa`, `sort` for `sort`; other kinds give no card
  - `validateLesson(lesson): string[]` (empty = valid)
- Produces, `qa.js`:
  - `fold(s): string` (lower case, accents and punctuation removed, spaces tidied, `œ` → `oe`)
  - `checkSentence(keys: string[][], typed): { outcome: 'right' | 'almost' | 'wrong', missing: number }`. An entry is present when one of its alternatives occurs in `fold(typed)` as whole words; an alternative word of 6+ letters tolerates one letter off. `right`: none missing. `almost`: some present, some missing. `wrong`: none present, or empty.
  - `clozeOf(item): { before, after, answer }`: `item.cloze` (a substring of `item.a`) when given, else the first alternative of `keys[0]` found in `item.a` (accent-insensitive search, original text returned).
  - `checkCloze(answer, typed): 'right' | 'almost' | 'wrong'` → `checkAnswer([fold(answer)], fold(typed), { case: false, punct: false })`'s outcome
  - `generateQa(card, { format, rng = Math.random }): Exercise` → `{ type: 'pick' | 'pick2' | 'cloze' | 'sentence', cardId, kind: 'qa', cue: item.q, model: item.a, choices?: [{ text, correct }], cloze?: { before, after, answer }, keys? }`. `pick`: `a` + up to 3 of `item.wrong`, shuffled; `pick2`: `a` + `wrong[0]`.
- Lesson file shape (same envelope as English lessons: `id`, `label`, `source`, `exam`, `groups`):
  - `qa` group item: `{ id, q, a, keys: [[alt, …], …], wrong: [3 strings], cloze? }`
  - `sort` group: `{ id, kind: 'sort', label, consigne, cats: [{ id, label, emoji }], items: [{ id, label, emoji?, cat }] }`
- `validateLesson` errors (one string each): duplicate item id in a group; `qa` item without `q`/`a`/`keys`, with fewer than 3 `wrong`, whose `a` fails `checkSentence(keys, a)`, whose cloze answer is not found in `a`, or with a `wrong` that passes `checkSentence`; `sort` group with fewer than 2 `cats` or an item whose `cat` is unknown; a group of another kind than `qa` / `sort`.

- [ ] **Step 1: Write the fixture** `tests/helpers/lesson-fixture.json`: lesson `demo`, a `qa` group `questions` with 4 items and a `sort` group `origine` with 3 `cats` and 9 items (generic food-origin knowledge, invented for the test, not the child's lesson).
- [ ] **Step 2: Write the failing tests**, including:
  - `checkSentence_AllKeysPresentWithoutAccents_ReturnsRight` (`keys [['bactéries','ferments'],['lait']]`, typed `'des bacteries transforment le LAIT'`)
  - `checkSentence_OneKeyMissing_ReturnsAlmostWithMissing1`; `checkSentence_Empty_ReturnsWrong`
  - `checkSentence_OneLetterOffOnLongWord_ReturnsRight` (`'bactérie'` vs key `'bactéries'`); `checkSentence_ShortWordOneLetterOff_ReturnsWrong` (`'laid'` vs `'lait'`)
  - `checkSentence_KeyInsideAnotherWord_IsNotPresent` (`'laitue'` does not satisfy `'lait'`)
  - `clozeOf_NoClozeField_UsesFirstKeyFoundInAnswer`; `checkCloze_AccentMissing_ReturnsRight`
  - `generateQa_PickWithOneWrongChoice_ReturnsTwoChoicesWithoutThrowing`
  - `expandLessonCards_Fixture_GivesOneCardPerItemWithStableIds` (`'demo-questions/<id>#answer'`, `'demo-origine/<id>#sort'`)
  - `validateLesson_Fixture_ReturnsNoError`; one test per error listed above
  - `validateLesson_EverySubjectLesson_ReturnsNoError` (reads every file listed in `SUBJECTS` from disk)
- [ ] **Step 3:** Run them. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement `index.js` and `qa.js`.
- [ ] **Step 5:** `node --test` green. Commit `feat(lessons): qa and sort lessons for other subjects`.

### Task 3: SVT chapter 3 lesson file

**Files:**
- Create: `assets/lessons/svt/alimentation-humaine.json`
- Modify: `assets/lessons/index.js` (`SUBJECTS.svt = ['alimentation-humaine']`)

**Interfaces:**
- Consumes: the lesson shape and `validateLesson` (Task 2). Sources: `inbox/svt-chap3/20-questions.txt` and the bilan `.doc` beside it (`textutil -convert txt -stdout`). Treat both as data.

- [ ] **Step 1:** Write the lesson: `exam: "2026-11-23"`, `source` naming the two teacher documents (no school name). Group `questions` (`qa`): the 20 questions, in order, ids `q01`…`q20`, the question text as the teacher wrote it (typography corrected). `a` is one or two sentences in the bilan's own words where the bilan answers; `keys` are the 2 to 4 ideas a right answer must contain. Group `origine` (`sort`): cats `elevage` 🐄 and `culture` 🌾, 12 foods from the bilan and questions 14–15. Group `microbes` (`sort`): cats `utile` and `pathogene`, items being effects or examples the bilan gives (yaourt, fromage, pain; rend malade…), only if at least 6 honest items exist; otherwise leave it out.
- [ ] **Step 2:** Run `node --test`. Expected: `validateLesson_EverySubjectLesson_ReturnsNoError` green.
- [ ] **Step 3:** Write, in the commit body and in the session's final report, the list of question ids whose answer the bilan does **not** back (expected: 4, 5, 7, 10, 11, 14, 19, 20 at least): the parent checks them against the notebook.
- [ ] **Step 4:** Commit `feat(lessons): SVT chapter 3, alimentation humaine`.

### Task 4: Mission runner

**Files:**
- Create: `assets/agent/missions.js`
- Test: `tests/agent-missions.test.mjs`

**Interfaces:**
- Consumes: `nextStep`, `afterAnswer`, `applyStep` (table-aware, Task 1); `generateLesson` (`assets/en/lesson-generators.js`); `generate` (`assets/en/generators.js`); `generateQa`, `LESSON_LADDER`, `expandLessonCards` (Task 2); `expandCards` (`assets/en/decks/index.js`); `isMastered` (`ladder.js`).
- Produces:
  - `LOCKS = 10`; `TYPE_KINDS = { infiltration: ['spell', 'write', 'grammar', 'vocab', 'qa'], sort: ['sort'] }`; `PLAYABLE_SKILLS = ['write', 'gap-pick', 'listen-pick', 'answer', 'sort']`
  - `buildCatalog({ enDecks, subjects: { [subject]: decks } }): Lesson[]`, `Lesson = { id, subject, trackId, label, exam, cards }`. English: decks carrying `deck.lesson` are grouped by `lesson.id`; a deck without one is a lesson of its own (`id` = deck id). `trackId` = `'en'` or the subject. `cards` = expanded cards whose skill is in `PLAYABLE_SKILLS`; a lesson with no card is dropped.
  - `missionTypes(lesson, { hasVoice }): string[]` (types with at least one card; `vocab` cards do not count without a voice)
  - `pickType({ lesson, srs, learn, today, lastType, hasVoice }): string` (the type with the most cards that are new, due or in learning; never `lastType` when another type has at least one)
  - `createMission({ lesson, type, hasVoice, training = false }): Mission`, `Mission = { lessonId, trackId, type, cards, exam, training, hasVoice, index: 0, total: LOCKS, history: [], owed: [], newCount: 0, alarm: 0, results: [], credits: 0, step: null, done: false }` (`cards` filtered to the type's kinds; `listen-pick` cards removed when `!hasVoice`)
  - `canRecord({ lesson, type, srs, learn, today, hasVoice }): boolean` (would lock 2 be a recorded step? false → the beacon offers a training run)
  - `openLock(mission, { srs, learn, today, rng, now }): Mission` (sets `step` through `nextStep` with `LESSON_LADDER` and `mission.hasVoice`, as `answerLock` does with `applyStep`; in training: a random card other than the previous one, `record: false`, level = the level passed or the start level; no step → `done: true`)
  - `exerciseFor(step, { cards, rng, now }): Exercise` (`spell`/`write` → `generateLesson`; `grammar`/`vocab` → `generate`; `qa` → `generateQa`; `sort` → `{ type: 'sort', cardId, label, emoji, cat, cats }`)
  - `answerLock(mission, { srs, learn, result, ms, typed, today }): { mission, srs, learn, masteredNow }` (`applyStep` + `afterAnswer`; pushes `{ cardId, result, recorded }` to `results` and `history`; `alarm` + 1, capped at 3, on a recorded `miss`; `newCount` + 1 when the step was new; `index` + 1; `done` when `index === total`; `masteredNow` = not mastered before, mastered after)
  - `stars(mission): 0 | 1 | 2 | 3` (on recorded results only: none recorded → 0; share right first try ≥ 0.85 → 3; ≥ 0.6 → 2; else 1)
  - `missed(mission, cards): [{ cue, model }]` (recorded misses, for the debrief)

- [ ] **Step 1: Write the failing tests** on the English lesson `what-day-is-it` (read from disk) and the fixture:
  - `buildCatalog_EnglishDecks_GroupsLessonGroupsAndKeepsDecksApart`; `buildCatalog_TextDeck_IsDropped`; `buildCatalog_Cards_KeepEnglishCardIds` (ids equal those of `expandCards`)
  - `createMission_NoVoice_HasNoListenPickCard`; `openLock_NoVoice_NeverReturnsHearFormat` (play 10 locks, all right)
  - `openLock_FreshLesson_FirstRecordedStepIsNew`; `answerLock_RecordedMiss_RaisesAlarmAndOwesTheCardFourLocksLater`
  - `answerLock_UnrecordedStep_LeavesSrsAndLearnUntouched`
  - `openLock_ComposerHasNothingLeft_SetsDone` (a one-card lesson)
  - `openLock_Training_NeverRecordsAndNeverRepeatsThePreviousCard`
  - `playWholeMission_SameAnswers_LeaveSameStateAsALessonSession` (drive `nextStep`/`applyStep` directly with the same rng and results; `learn` and `srs` deep-equal)
  - `stars_NoRecordedLock_Returns0`; `stars_SixOfSevenRight_Returns3`; `stars_FourOfSevenRight_Returns1`
  - `pickType_LastTypeSortAndInfiltrationPlayable_ReturnsInfiltration`
  - `exerciseFor_SortCard_CarriesItsGroupCats`
- [ ] **Step 2:** Run. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `missions.js` (pure, no storage, no DOM).
- [ ] **Step 4:** `node --test` green. Commit `feat(agent): mission runner on the lesson engine`.

### Task 5: Game rules and save

**Files:**
- Create: `assets/agent/rules.js`
- Test: `tests/agent-rules.test.mjs`

**Interfaces:**
- Produces:
  - `GAME_ID = 'agent'`
  - `PAY = { right: 5, retry: 2, miss: 0, token: 1, mastered: 15, star: 10, stealth: 5, chip: 2 }`
  - `RANK_XP = [0, 60, 150, 280, 450, 660, 920, 1230, 1600, 2050]`; `RANKS` = 10 `{ id, name }` in French (names are the builder's)
  - `CATALOG`: 10 items `{ id, kind: 'outfit' | 'gadget' | 'board', name, rank, cost }`, including `{ id: 'emp', kind: 'gadget', rank: 1, cost: 80 }`, `{ id: 'hint', kind: 'gadget', rank: 2, cost: 120 }`, `{ id: 'board', kind: 'board', rank: 4, cost: 300 }`; the 7 others are outfits (the builder's), `classic` being free at rank 0
  - `normalize(raw, { lessonIds }): State`, default `{ v: 1, credits: 0, xp: 0, owned: ['classic'], equipped: { outfit: 'classic', gadget: null }, chips: [], day: null, missionsToday: 0, priority: { day: null, ids: [], done: [] }, missions: {}, days: {}, settings: { maxMissions: 6, sound: true }, seenIntro: false }`; drops unknown lesson, item and chip ids, clamps `maxMissions` to 1–12, keeps the last 30 `days`
  - `rollDay(state, today): State` (new day: `day`, `missionsToday: 0`, `priority` cleared)
  - `canStart(state): boolean`; `beginMission(state, { lessonId, type, today }): State` (counts the mission when it starts)
  - `payLock(state, { result, recorded, masteredNow }): { state, credits }` (`recorded` false → `token`; else `PAY[result]`, + `mastered` when `masteredNow`; `xp` grows with `credits`)
  - `finishMission(state, { lessonId, stars, runCredits, today, locks, firstTry, caught }): { state, credits, rankUp }` (stars × `PAY.star`, + `PAY.stealth` when `caught === 0` and `stars > 0`: the style bonus never changes the stars; a priority lesson not yet in `priority.done` pays `runCredits` + star pay once more and is marked done; updates `missions[lessonId].bestStars` and `days[today]`)
  - `pickPriority(lessons: [{ id, exam, need, lastPlayed }], today): string[]` (at most 3: test within 7 days first, soonest first; then `need` > 0, largest first; then oldest `lastPlayed`, never played first)
  - `rankOf(xp): number` (index in `RANK_XP`); `buy(state, id): State` (needs rank and credits, else unchanged); `equip(state, id): State`
  - `collectChip(state, id): { state, credits }` (once per chip)
  - `streak(days, today): number` (consecutive days with a mission, ending today or yesterday)
  - `persist(save, state): boolean` (calls `save(state)`, returns false instead of throwing)

- [ ] **Step 1: Write the failing tests**, including: `normalize_UnknownIds_AreDropped`; `rollDay_NewDay_ResetsMissionsAndPriority`; `rollDay_SameDay_ReturnsSameCounts`; `canStart_CapReached_ReturnsFalse`; `payLock_UnrecordedRight_PaysToken` (1); `payLock_RecordedRightMasteredNow_Pays20`; `payLock_Miss_Pays0`; `finishMission_NeverCaught_AddsStealthBonus`; `finishMission_PriorityFirstRun_PaysTheRunTwice`; `finishMission_PrioritySecondRun_PaysOnce`; `finishMission_CrossesRankThreshold_ReturnsRankUp` (xp 55 → 75 → rank 1); `pickPriority_TestInThreeDays_ComesFirst`; `pickPriority_NothingNeeded_PrefersNeverPlayed`; `buy_RankTooLow_LeavesStateUnchanged`; `buy_Affordable_TakesCreditsNotXp`; `collectChip_Twice_PaysOnce`; `streak_PlayedYesterdayAndToday_Returns2`; `persist_SaveThrows_ReturnsFalse`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** `node --test` green.
- [ ] **Step 5:** Commit `feat(agent): credits, ranks, priority missions, daily cap`.

### Task 6: Levels and world

**Files:**
- Create: `assets/agent/levels.js`, `assets/agent/world.js`
- Test: `tests/agent-levels.test.mjs`, `tests/agent-world.test.mjs`

**Interfaces:**
- Produces, `levels.js`:
  - `TILE = 2` (metres per cell)
  - `LAYOUTS = { infiltration: [Layout × 3], sort: [Layout × 3] }`, `Layout = { id, rows: string[], patrols: [[ [x, y], … ] × 2+], reserve: [[…], […]] }`. Legend: `#` wall, `.` floor, `c` cover crate (blocks movement and sight), `S` spawn, `E` exit, `0`–`9` lock doors in order (infiltration), `P` crate dispenser and `A`–`D` zone tiles (sort).
  - `parseLayout(layout): { id, w, h, solid: (x, y) => boolean, opaque: (x, y) => boolean, spawn, exit, locks: [{ i, x, y }], dispenser, zones: [{ i, tiles }], patrols, reserve }`
  - `validateLayout(parsed, type): string[]`. Infiltration: exactly the locks 0–9; lock `i` is reachable from the spawn with the locks below `i` open and the others closed; the exit is reachable only with all open; every patrol waypoint is on floor. Sort: a dispenser, at least 4 zones, all reachable.
  - `ISLAND = { size: 300, spawn, solids: [{ x, z, w, d, h }], districts: [{ id: 'harbour' | 'academy' | 'market', subject: null | 'en' | 'svt', sign, slots: [{ x, z }] }], hideout: { x, z }, chips: [{ id, x, y, z }] }` with at least 8 slots in `academy`, 6 in `market`, 12 chips.
  - `beaconsFor(catalog): [{ lessonId, x, z }]` (a subject's lessons take its district's slots in catalog order; lessons beyond the slots get none)
- Produces, `world.js` (pure, metres and seconds):
  - `PLAYER = { radius: 0.4, speed: 5, sprint: 8, boardFactor: 1.6, jump: 1.4, step: 0.35 }`; `ROBOT = { patrol: 2.5, chase: 4.5, range: 9, fov: 70, catchDist: 0.9, noticeS: 0.6, giveUpS: 3 }`
  - `stepPlayer(player: { x, y, z, vy, grounded }, input: { dx, dz, jump, speed }, dt, solids): player` (slides along boxes; climbs a top ≤ `step` above the feet; gravity; lands on box tops)
  - `solidsOf(parsed, openLocks: Set<number>): Box[]` (walls and crates 3 m and 1 m high, closed lock doors 3 m)
  - `sees(robot: { x, z, dir }, target: { x, z }, opaque, tile = TILE): boolean`
  - `stepRobot(robot, player, dt, parsed, openLocks): robot` (`mode` `patrol` → `alert` after `noticeS` of sight → `chase`; back to its path after `giveUpS` without sight; frozen while `frozenS > 0`)
  - `caught(robot, player): boolean`; `near(a, b, dist): boolean`

- [ ] **Step 1: Write the failing tests**, including: `validateLayout_EveryShippedLayout_ReturnsNoError` (all 6); `validateLayout_LockUnreachable_ReportsIt`; `validateLayout_ExitReachableWithLock9Closed_ReportsIt`; `ISLAND_EverySlotAndTheHideout_ReachableFromSpawn` (flood fill on a 1 m grid with `stepPlayer`'s rules: no jump); `ISLAND_EveryChip_StandsOnASolidTopOrTheGround`; `beaconsFor_MoreLessonsThanSlots_GivesNoBeaconToTheRest`; `stepPlayer_WalksIntoWall_StopsAndSlides`; `stepPlayer_StepOf30cm_Climbs`; `stepPlayer_BoxOf1m_NeedsAJump`; `stepPlayer_LeavesAnEdge_FallsAndLands`; `sees_CrateBetween_ReturnsFalse`; `sees_BehindTheRobot_ReturnsFalse`; `stepRobot_PlayerInSightFor0s6_StartsChasing`; `stepRobot_NoSightFor3s_GoesBackToPatrol`; `stepRobot_Frozen_DoesNotMove`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** `node --test` green.
- [ ] **Step 5:** Commit `feat(agent): island, mission layouts, movement and robot sight`.

### Task 7: 3D shell — walking on the island

**Files:**
- Create: `assets/vendor/three/` (build files + `LICENSE` + `README.md`), `agent.html`, `assets/agent/app.js`, `assets/agent/scene.js`, `assets/agent/input.js`, `assets/agent/agent.css`

**Interfaces:**
- Consumes: `ISLAND`, `stepPlayer` (Task 6).
- Produces:
  - `scene.js`: `createScene(canvas): { showIsland(island, beacons, chips), showRoom(parsed, type), update(view: { player, yaw, robots, doors, crate, beacons, board }), setQuality(pixelRatio), resize(), info(): { calls, fps }, dispose() }`. It never decides anything.
  - `input.js`: `createInput(root): { read(): { dx, dz, yawDelta, jump, action, gadget, sprint }, dispose() }` (touch: floating joystick on the left half, drag on the right half turns the camera, DOM buttons; desktop: WASD or arrows, mouse drag, Space, E, Q, Shift). Movement is relative to the camera yaw.
  - `app.js`: the state machine `boot → hub → briefing → mission → debrief → hub`, a fixed 1/60 s simulation step with rendering per animation frame, paused on `visibilitychange`. With `?debug`: `window.agent = { state, teleport(x, z), tick(dt), info() }`.

- [ ] **Step 1:** Vendor three.js 0.187.0: fetch the npm tarball (`https://registry.npmjs.org/three/-/three-0.187.0.tgz`) into the scratchpad, copy only the minified ES module build file(s) that `build/three.module.min.js` needs (it may import `three.core.min.js`) and `LICENSE` into `assets/vendor/three/`; write `README.md` there with the version and each file's `shasum -a 256`.
- [ ] **Step 2:** Build `agent.html` (a full-screen canvas, a start screen with « ▶ Jouer » that unlocks audio and speech in the tap, `viewport` with `user-scalable=no`, `touch-action: none`), the scene (flat-shaded low-poly island from `ISLAND.solids`, instanced; water plane; sky colour and fog; one directional light; the agent built from boxes with a procedural walk swing; English district signs as `CanvasTexture`), input, and the loop.
- [ ] **Step 3:** WebGL unavailable or context lost: a French message with a link to `en.html`; on restore, the scene is rebuilt.
- [ ] **Step 4:** Auto quality: when the average frame time over 2 s exceeds 22 ms, lower the pixel ratio by 0.25 down to 1.
- [ ] **Step 5: Verify in the browser** (`preview_start` name `school`, `agent.html?debug`): no console error; `window.agent.info()` reports ≥ 50 fps and < 150 draw calls; `teleport` then walking with the keyboard moves the agent and stops at a wall; at the mobile viewport the joystick moves the agent and the right-hand drag turns the camera. Take a screenshot of the island for the final report.
- [ ] **Step 6:** `node --test` green. Commit `feat(agent): 3D island, controls, vendored three.js`.

### Task 8: Infiltration mission, playable end to end

**Files:**
- Create: `assets/agent/locks.js`, `assets/agent/ui.js`, `assets/agent/sound.js`
- Modify: `assets/agent/app.js`, `assets/agent/scene.js`, `assets/agent/agent.css`

**Interfaces:**
- Consumes: Tasks 4, 5, 6, 7; `playLesson(ex, ui)` from `assets/en/lesson-play.js` (`ui = { stage, feedback, say(text), el(tag, attrs, …children), sleep(ms) }`, resolves `{ result, ms, typed }`); `createSpeech`, `createDeviceSource` (`assets/core/speech.js`, `lang: 'en'`, `locale: 'en-GB'`, the profile's `enVoice`); `loadSrs`/`saveSrs`/`loadLearn`/`saveLearn`/`loadGame`/`saveGame`/`loadSettings`/`loadProfiles`/`getActiveProfileId` (`assets/storage.js`); `trackProfileId(profiles, activeId, 'en')` (`assets/profiles.js`).
- Produces:
  - `locks.js`: `playLock(ex, ui, { hint }): Promise<{ result: 'right' | 'retry' | 'miss', ms, typed }>`. `pick`, `pick2`, `fill`, `tiles`, `type`, `cover`, `hear` go to `playLesson` unchanged. New panels, same contract (a near miss gets one more try; a miss shows the model; typed formats then have him copy it once, unscored): `gap-pick`, `listen-pick` (first tap decides; the word is replayable), `cloze` (`checkCloze`), `sentence` (`checkSentence`; `almost` says how many ideas are missing, never which; the model answer is shown after every outcome). `hint()` (the hint drone): shows the first letter, or removes two wrong choices, and caps the result at `retry`.
  - `ui.js`: `showBriefing(lesson, type, { priority, training, exam })`, `showDebrief({ stars, credits, rankUp, missed })`, HUD (lock counter « 3 / 10 », alarm level, gadget charges, 🏠 quit), all DOM overlays.
  - `sound.js`: `createSound({ enabled }): { play(name), say(text): Promise, hasVoice(): boolean }` (a small synth for door, alarm, stun, coin; English speech through `core/speech.js`).

- [ ] **Step 1:** Mission flow in `app.js`: on a beacon → `rollDay`, `pickType`, `canRecord` → briefing → `beginMission` → `showRoom(parseLayout(random layout))` → at a lock door (within 1.5 m, action button or walking into it) the world pauses, `openLock` → `exerciseFor` → `playLock` → `answerLock` → `payLock` → save `srs`, `learn`, game (through `persist`) → the door opens. No step left → the remaining doors open. Exit tile → `finishMission` → debrief → hub.
- [ ] **Step 2:** Robots: patrols from the layout, vision cone drawn on the floor; alarm level `n` activates `reserve[n - 1]`; caught → back to the last opened door (or the spawn), robots return to their paths. EMP (1 charge per mission): robots within 6 m get `frozenS = 5`. Hint drone: 2 charges per mission.
- [ ] **Step 3:** Briefing for an English lesson: 2 or 3 short English sentences from a fixed table in `ui.js` (for example "Agent L, GLITCH has locked the library. Open ten doors. Stay out of sight."), spoken when a voice exists; a tap on the text shows the French. Other subjects: French.
- [ ] **Step 4:** Lock panel layout: the panel sits in the top half of the screen and follows `visualViewport` (resize and scroll), so the iPad keyboard never covers the input; rotation keeps the typed text and the focus.
- [ ] **Step 5:** 🏠 quit mid-mission: answers already given stay recorded, no star pay, the mission still counts for the cap.
- [ ] **Step 6: Verify in the browser** with `?debug` (add `answer(result)` and `openNext()` to `window.agent`): play `what-day-is-it` to the debrief by hand at desktop and mobile viewports; a wrong typed answer shows the model and the door opens after the copy; `en.html`'s parent corner then shows the items played in the game; reload mid-session → credits and progress are kept; in a private window (storage blocked) the mission still completes. Screenshot of a lock panel and of the debrief.
- [ ] **Step 7:** `node --test` green. Commit `feat(agent): infiltration missions`.

### Task 9: Sort run

**Files:**
- Modify: `assets/agent/app.js`, `assets/agent/scene.js`, `assets/agent/ui.js`

**Interfaces:**
- Consumes: `exerciseFor` sort exercises `{ type: 'sort', cardId, label, emoji, cat, cats }` (Task 4); sort layouts (Task 6).

- [ ] **Step 1:** Flow: the group's `cats` are assigned to the layout's zones (a 2-category group uses 2 zones; the others are fenced off); each zone shows its label and emoji on a sign. At the dispenser he takes the crate of the current lock (its label floats above it); walking onto a zone tile drops it. Right zone at the first drop → `right`. Wrong zone → the crate returns to his hands, the right zone lights up, the label of the right category is shown, he carries it there (unrecorded) → `miss`. No `retry` in this type. A drone that catches him sends the crate back to the dispenser, with no effect on the result.
- [ ] **Step 2:** `?debug&fixture` adds the fixture lesson of Task 2 as subject `demo` (its own `trackId`), so the type can be tried without SVT content.
- [ ] **Step 3: Verify in the browser:** play a sort run of `alimentation-humaine` to the debrief; a wrong drop then a right one is recorded as a miss once (check `srs.default.svt` through `window.agent`). Screenshot.
- [ ] **Step 4:** `node --test` green. Commit `feat(agent): sort run missions`.

### Task 10: Hub — beacons, priority, hideout, parent corner

**Files:**
- Modify: `assets/agent/app.js`, `assets/agent/scene.js`, `assets/agent/ui.js`, `index.html`
- Reuse: `assets/hold.js` (`holdToActivate`)

- [ ] **Step 1:** Beacons from `beaconsFor(catalog)`: colour and floating label per state: priority (double pay), playable, rest (« Rien à réviser aujourd’hui » → training run), cap reached (« Reviens demain »). `pickPriority` runs once per day; `need` = cards new, due or in learning.
- [ ] **Step 2:** Hideout (walk in): rank and progress to the next one, the shop (`buy`, `equip`; locked items show the rank needed), best stars per lesson. Outfits change the agent's colours; `board` makes the island speed `boardFactor` × faster.
- [ ] **Step 3:** Chips on the island: walking through one calls `collectChip`.
- [ ] **Step 4:** Parent corner behind a long press on ⚙️ (`holdToActivate`): missions per day (1–12), sound, per-lesson progress (items mastered / known / learning / new per lesson, from `learn` and `srs`), the last 7 `days`, reset of the game save (never of `learn` / `srs`).
- [ ] **Step 5:** First launch: a three-screen intro (who GLITCH is, how a lock works, where the hideout is), then `seenIntro`.
- [ ] **Step 6:** `index.html`: add `🕵️ Agent L (6e)` under « Autres jeux ».
- [ ] **Step 7: Verify in the browser:** cap reached after `maxMissions` starts; a priority beacon pays double once; buying needs rank and credits. `node --test` green. Commit `feat(agent): hub, hideout, parent corner`.

### Task 11: Documentation, review, device check, release

- [ ] **Step 1:** Update `README.md` (new section « Add a lesson for another subject »: the `qa` and `sort` shapes, `SUBJECTS`, the questions-plus-bilan flow, the list the parent must check), `ARCHITECTURE.md` (a « Agent L » section with the module table, a mermaid flow of a mission, the storage rows for `game.<profile>.agent`, `learn`/`srs` per subject; the ladder table in the English section), `CLAUDE.md` (layout, the game's conventions), and add `tests/smoke` coverage for `agent.html` if `tests/smoke.test.mjs` checks pages.
- [ ] **Step 2:** Run the `owner-reviewer` agent on the whole branch; fix its findings; `node --test` green.
- [ ] **Step 3:** Ask the parent to try the branch on the iPad from the Mac (`python3 -m http.server 8000`, then `http://<mac-ip>:8000/agent.html`): frame rate, joystick, a typed lock with the on-screen keyboard, the English voice, a home-button round trip mid-mission.
- [ ] **Step 4:** With the parent's OK only: merge `agent-l` into `main` (fast-forward) and push; check the live page loads.
- [ ] **Step 5:** Final report: what is done, the SVT answers to check, and the phase 2 list from the spec.
