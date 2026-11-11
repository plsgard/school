# Lessons from Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lesson file (written by Claude from photos) becomes a "Réviser cette leçon" session in the English track, with a four-level written ladder that adapts to the child; first lesson "What day is it?" for a test on 2026-11-13.

**Architecture:** Pure modules under `assets/en/` (answer checking, ladder, lesson composer, exercise generators, report) with `node --test` tests; DOM renderers in one new module; `app.js` gains a lesson session next to the untouched daily session. Ladder state lives in a new storage key, so the shared Leitner scheduler and the GS/CE2 tracks are not modified.

**Tech Stack:** Vanilla ES modules, no build, Bootstrap 5.3 CDN, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-lessons-from-photos-design.md`

## Global Constraints

- No build step, dependency, framework, backend or key. Storage only through `assets/storage.js`.
- Existing decks' card ids and the daily session's `nextCard` behaviour do not change; all existing tests stay green.
- Test names: `Method_Condition_Expectation`, one behaviour per test, `node --test tests/`.
- UI copy French, NBSP before `! ? : ;`; non-colour cues ✅ ❌; `role="status"` feedback region kept.
- Typed inputs: `autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false"`, Enter submits.
- Photos are never committed. Lesson language is the correct English; the child's slips appear only in `slips`.
- Commit after each task; push to `main` only at the end, after browser verification and the review gate.

## Review Focus

1. iOS keyboard rewriting the answer (autocorrect/autocapitalise) — attributes asserted in the browser pass (Task 5).
2. A card id present in stored state but removed from the lesson file — composer and report must skip unknown ids (Task 4, Task 6 tests).
3. No English device voice — `write` items top out at level 3, never a silent dictation (Task 2 test).
4. Lesson with fewer cards than session slots, or all mastered — session ends early or replays unrecorded, never loops or throws (Task 4 test).
5. Typed answer with trailing space, double space or curly apostrophe — treated as the same answer (Task 1 test).

---

### Task 1: Answer checking

**Files:** Create `assets/en/answer.js`, `tests/en-answer.test.mjs`

**Interfaces — Produces:**
- `checkAnswer(accepted: string[], typed: string, strict: {case: boolean, punct: boolean}) -> { outcome: 'right'|'almost'|'wrong', reasons: ('case'|'punct'|'spelling')[] }`
- `strictFor(kind: 'spell'|'write', item) -> {case, punct}` (defaults: write both true; spell case true, punct false; `item.strict` overrides)
- `tidy(s) -> string` (trim, collapse spaces, `’` → `'`)

Rules: exact (after `tidy`) → right. Equal once case and/or `,.!?` are ignored → `almost` with the reasons, unless that aspect is not strict (then right). Else Levenshtein on the loosened forms ≤ 2 (≤ 1 when the answer has ≤ 5 characters) → `almost`/`spelling`. Else wrong. Best outcome over all accepted answers.

- [ ] Tests: `checkAnswer_Exact_Right`; `_TrailingAndDoubleSpacesCurlyApostrophe_Right`; `_LowercaseDayStrictCase_AlmostCase` (`wednesday` vs `Wednesday`); `_MissingCommaStrictPunct_AlmostPunct` (`Wednesday April 12th`); `_BothMissing_AlmostCaseAndPunct`; `_OneLetterOff_AlmostSpelling` (`Tursday`); `_ShortAnswerOneOff_AlmostSpelling` (`3nd`/`3rd`); `_FarOff_Wrong` (`Tuesday` vs `Thursday`); `_SecondAcceptedAnswer_Right`; `strictFor_Defaults_PerKind`.
- [ ] Run (fail) → implement → run (pass) → commit `feat(en): typed answer checking`.

### Task 2: Ladder and its storage

**Files:** Create `assets/en/ladder.js`, `tests/en-ladder.test.mjs`; modify `assets/storage.js` (add `loadLearn(profileId, trackId) -> {cards:{}, formats:{}}`, `saveLearn(profileId, trackId, learn)`, key `school.v1.learn.<profile>.<track>`), `tests/storage.test.mjs`.

**Interfaces — Produces:**
- `LEARN_KINDS = ['spell','write']`; `startLevel(kind)` → spell 1, write 2; `topLevel(kind, hasVoice)` → spell 3, write 4 (3 without voice).
- `FORMATS = { spell: {1:['pick'], 2:['fill','tiles'], 3:['type','cover']}, write: {2:['tiles','fill'], 3:['type','cover'], 4:['hear']} }`
- `FAST_MS = {1: 4000, 2: 9000, 3: 12000}`
- Card learn state: `{ lvl, miss, alt, passed, fmt, last, topDays: string[] }`; `initial(kind)`.
- `pickFormat(kind, state, formatStats) -> string` — one format: it (`pick2` when `state.alt` at level 1); two: the better `ok/n` when both `n >= 8`, else the first; `state.alt` flips to the other.
- `applyAnswer(learn, cardId, kind, { result: 'right'|'retry'|'miss', ms, format, typed, today, top }) -> learn` (pure, new object). Right: stats of the card's previous `fmt` get `n++, ok++`; `passed = max`; at `top` add `today` to `topDays`; else `lvl = min(top, lvl + (ms < FAST_MS[lvl] ? 2 : 1))`; `miss = 0, alt = false`. Retry: previous-format stats `n++`; nothing else. Miss: previous-format stats `n++`; `last = typed`; at `top` with `topDays.length > 0` → `lvl = top - 1`; else first miss → `miss = 1, alt = true`; second → `lvl = max(start, lvl - 1), miss = 0, alt = false`. Always `fmt = format`.
- `isMastered(state) -> boolean` (`topDays.length >= 2`); `phase(state, srsCard) -> 'learning'|'review'` (review when `srsCard` exists and `state.lvl === top`).

- [ ] Tests: `applyAnswer_RightSlow_UpOneLevel`; `_RightFast_SkipsALevelCappedAtTop`; `_RightAtTop_RecordsTheDayOnce`; `_Retry_KeepsLevel`; `_FirstMiss_StaysAndFlagsOtherFormat`; `_SecondMissInARow_DropsOneLevelNotBelowStart`; `_MissAfterMastery_BackOneBelowTop`; `_Miss_KeepsWhatWasTyped`; `_AnyAnswer_UpdatesPreviousFormatStats`; `pickFormat_SmallSample_TableOrder`; `_EnoughSamples_PrefersBetterFormat`; `_AltFlag_OtherFormatOrPick2`; `topLevel_WriteWithoutVoice_Three`; `isMastered_TwoDays_True`; storage: `loadLearn_Empty_DefaultShape`, `saveLearn_RoundTrip`.
- [ ] Fail → implement → pass → commit `feat(en): written ladder state`.

### Task 3: Lesson file, loader, generators, first lesson

**Files:** Create `assets/en/decks/what-day-is-it.json`, `assets/en/lesson-generators.js`, `assets/en/today.js`, `tests/en-lessons.test.mjs`; modify `assets/en/decks/index.js`.

**Interfaces — Produces:**
- `LESSON_FILES = ['what-day-is-it']` (DECK_FILES untouched); `flattenLesson(lesson) -> deck[]` — each group → `{ id: `${lesson.id}-${group.id}`, kind, label, items, lesson: { id, label, exam, source } }`; `loadDecks()` returns lesson decks first, then DECK_FILES decks.
- `skillsFor`: `spell`/`write` → `['write']`.
- `today.js`: `formatDate(date: Date) -> 'Wednesday, November 11th'`; `ordinalSuffix(n)`; `resolveItem(item, now) -> item` (for `dynamic: 'today'`: `en = ['Today is <d>.', 'Today is <d>', '<d>']`).
- `generateLesson(card, { level, format, cards, rng, now }) -> exercise`: common `{ type: format, cardId, cue, consigne, accepted, model, strict, say }`; `pick`/`pick2` add `choices: [{text, correct}]` (4 or 2: model + `slips`, completed by other items' models of the same deck); `fill` adds `pattern` (spell: letters blanked where the slips differ from the model, else every other inner letter, first letter kept; write: one or two tokens blanked, `_` per letter); `tiles` adds `tiles: string[]` shuffled, never already in order (spell: letters; write: words with `,` `.` `?` as separate tiles) and `join(tiles) -> string`; `cover` adds `showMs: 3000`; `hear` sets `cue: null`, `say: item.hear ?? model`.
- Lesson content per spec §9, `exam: "2026-11-13"`, slips from the notebook (Tuestay, Tursday, birday context, 3nd, 21th).

- [ ] Tests: `flattenLesson_Groups_DeckIdsAndLessonMeta`; `lessons_EveryItem_ValidIdsCueAnswers`; `lessons_Slips_NeverAccepted` (via `checkAnswer` → not `right`); `lessons_SpellItems_HaveThreeDistractors`; `lessons_Exam_IsIsoDate`; `expandCards_SpellAndWrite_OneWriteCardPerItem`; `generateLesson_Pick_FourChoicesOneCorrect`; `_Pick2_TwoChoices`; `_FillSpell_PatternKeepsLengthAndHidesSlipLetters`; `_TilesWrite_JoinRebuildsModelAndIsShuffled`; `_Hear_SaysTheSpokenForm`; `formatDate_Suffixes_1st2nd3rd11th21st`; `resolveItem_Today_AcceptsSentenceAndBareDate`; `lessons_DatesGroup_CoversEveryDayAndMonth`.
- [ ] Fail → implement → pass → commit `feat(en): lesson files and the dates lesson`.

### Task 4: Lesson session composer

**Files:** Create `assets/en/lesson-session.js`, `tests/en-lesson-session.test.mjs`

**Interfaces — Consumes:** Task 2 (`initial`, `topLevel`, `pickFormat`, `phase`, `isMastered`, `startLevel`, `LEARN_KINDS`), `dueCards` from core.
**Produces:**
- `examSoon(exam, today) -> boolean` (0–7 days ahead).
- `available(card, { cards, learn }) -> boolean` — a `write`-kind item is available once every word of its model that is the model of a `spell` item of the same lesson has a learn state.
- `nextStep({ cards, srs, learn, today, exam, hasVoice, history, owed, index, total, rng }) -> { card, level, format, record } | null` where `history` = this session's `[{cardId, recorded}]`, `owed` = `[{cardId, notBefore}]`. Order: opener (`index < 2`) and closer (`index === total - 1`): a card with `passed`, replayed at `passed`, `record: false`, not the previous card, not yet used as a reward this session — none → normal pick. Normal pick: (1) owed with `notBefore <= index`; (2) every third slot, a `write`-kind candidate when one qualifies; (3) learning cards already seen, lowest level first; (4) new cards in file order (cap `ceil(total / 2)` per session unless `examSoon`); (5) review cards due (`srs` due, or — when `examSoon` — not mastered and last `topDays` ≠ today); (6) owed not yet due; (7) unrecorded replay of any passed card. Never the previous card; a card at most 3 recorded plays per session. Non-learn kinds of the lesson (`grammar`): unseen = new (4), due = review (5), `level: null, format: null`.
- `afterAnswer({ owed, cardId, index, result, levelChanged }) -> owed` — miss or level change → owed again at `index + 4`.

- [ ] Tests: `nextStep_NoHistory_OpensWithFirstGroupLevelOnePick`; `_WithPassedCards_FirstTwoAndLastAreUnrecordedReplays`; `_OwedCard_ComesBackAfterThreeOthers`; `_NeverSameCardTwiceInARow`; `_CardPlayedThreeTimes_NotPickedAgain`; `_WriteItems_LockedUntilTheirWordsAreMet`; `_ThirdSlots_PreferWriteGroup`; `_ExamSoon_NoNewCapAndUnmasteredReviewsDaily`; `_NoExam_NewCappedAtHalf`; `_AllMastered_ReplaysUnrecordedOrEnds`; `_UnknownStoredIds_Ignored`; `_GrammarCards_NewThenDue`; `examSoon_PastOrFar_False`.
- [ ] Fail → implement → pass → commit `feat(en): lesson session composer`.

### Task 5: Screens

**Files:** Create `assets/en/lesson-play.js`; modify `assets/en/app.js`, `assets/en/en.css`, `en.html` (only if a node is missing).

**Interfaces — Produces:** `playLesson(ex, { stage, feedback, say, el, sleep }) -> Promise<{ result: 'right'|'retry'|'miss', ms, typed }>` handling `pick`, `pick2`, `fill`, `tiles`, `type`, `cover`, `hear`. Typed formats: `almost` → message naming the reason (`Presque ! Il manque la majuscule.` / `la virgule` / `Regarde bien l’orthographe.`) and one more try. Miss on a typed format: model shown with differing characters marked (`<mark>`), then a copy field that must equal the model before "Continuer". Pick: one tap decides.

`app.js`: home groups lesson decks into one card (label, `Contrôle dans N jours` / `Contrôle aujourd’hui` when `exam` set and not past, progress = mastered and "su" (`passed >= top`) over items, ▶ `Réviser cette leçon`); `runLessonSession(lessonId)` loop: `nextStep` → `generateLesson` (or existing `generate` for grammar) → play → when `record`: `applyAnswer` + `saveLearn`; at top level right first try (or any answer of a card already in `srs`) also `recordResult` + `saveSrs`; `appendSession` with `{ lesson, items }`; done screen lists misses with what was typed. Daily session: pass `cards.filter(c => !LEARN_KINDS.includes(c.kind) || srs.cards[c.id])`; a learn-kind card there plays its top-level format through `playLesson` and records as today.

- [ ] Implement; run all tests (pass).
- [ ] Browser pass at iPad width on `python3 -m http.server`: each format once, a miss path, a "presque" path, input attributes present, daily session still starts, no console error.
- [ ] Commit `feat(en): lesson sessions and written exercises`.

### Task 6: Parent corner and report

**Files:** Create `assets/en/lesson-report.js`, `tests/en-lesson-report.test.mjs`; modify `assets/en/parent.js`.

**Interfaces — Produces:** `lessonReport({ lesson, cards, learn, srs, hasVoice, today }) -> { label, exam, total, mastered, byLevel: {new, 1, 2, 3, 4}, watch: [{ model, typed, level }] }`; `reportText(report) -> string` (plain text, French, one line per watched item `Thursday ← « Tursday » (niveau 2)`).
Parent corner: one card per lesson with those numbers, the watch list, and `Copier le bilan` (`navigator.clipboard.writeText`, fallback: a selected read-only textarea).

- [ ] Tests: `lessonReport_MixedStates_CountsPerLevelAndMastered`; `_WatchList_HasLastTypedSortedByLowestLevel`; `_UnknownIds_Ignored`; `reportText_ListsLessonAndWatchedItems`.
- [ ] Fail → implement → pass → browser check → commit `feat(en): lesson progress for parents`.

### Task 7: Docs, review, ship

- [ ] ARCHITECTURE.md: lesson format, ladder (mermaid state diagram), photos → lesson loop (mermaid), new storage key. README: "Photos → lesson" procedure (HEIC via `sips`, photos to `inbox/`, never committed, write the file, `node --test tests/`, push). CLAUDE.md: tests exist, pointer to the procedure, layout.
- [ ] Release-style check: `node --test tests/` green.
- [ ] Review gate: `owner-reviewer` agent on the branch diff; fix findings.
- [ ] Push `main`; open the live page and start a lesson session.
