# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, zero-build web app the owner built for his own kids: timed math quizzes and an **English track** (`en.html`, matched to his class lessons: speech-checked pronunciation, and **lessons made from photos of his notebook**, revised in writing on a level ladder before a test) for the older child (6e), a **CE2 column-subtraction track** (`ce2.html`: generated problems on a level ladder, taught and checked in the class's method, compensation) for the middle one, and a spaced-repetition **Grande Section learning track** (`gs.html`: sounds, letters, syllables, tracing in capitals and cursive, numbers to 10; one daily session plus unlimited themed practice rounds) for a 5-year-old who cannot read yet. Hosted on **GitHub Pages directly off `main`** — pushing to `main` is the deploy. There is no CI, no build, no package manager, no backend; persistence is `localStorage`. Pure modules have `node:test` tests.

The audience is young learners — keep UI copy simple, validation friendly, and avoid clever abstractions that make the source harder to tweak on the fly. On the GS track every instruction must work for a non-reader (spoken, with pictures), and every French text must be correct French (typography included: non-breaking space before `! ? : ;`).

See [`README.md`](README.md) for run/deploy/test basics, the iPad setup, deck authoring and clip recording, and [`ARCHITECTURE.md`](ARCHITECTURE.md) for modules, the storage schema, the learning-track engine and the quiz DOM contract.

## Layout

```
/
├── index.html                       # "Qui joue ?" profile picker + "Autres jeux" (math quizzes)
├── multiplication.html, addition.html   # math quiz pages
├── gs.html                          # Grande Section track
├── ce2.html                         # CE2 track (column subtraction by compensation, level ladder)
├── en.html                          # 6e English track (listen-pick, say-it + pronunciation check, lessons from photos)
├── jeu.html                         # CE2 game « L’île des Gribouilles » (canvas: village + expeditions, whole CE2 programme)
├── assets/
│   ├── quiz.js, quiz.css            # math quiz engine (Settings → Quiz → Result → History) + shared styles
│   ├── storage.js                   # versioned, namespaced localStorage layer (the only localStorage user)
│   ├── celebration.js               # confetti + congrats overlay
│   ├── profiles.js, hold.js         # profile picker / profile ↔ track; long-press parental gate
│   ├── core/                        # track-agnostic engine: scheduler.js, session.js, progress.js, speech.js
│   ├── gs/                          # GS track: app.js, parent.js, themes.js, generators.js, renderers.js,
│   │   │                            #   trace.js, trace-score.js, trace-geom.js, rules.js, cues.js, say.js,
│   │   │                            #   name-cards.js, gs.css
│   │   └── decks/                   # index.js (DECK_FILES) + letters.json, numbers.json,
│   │                                #   mots-p1.json (période 1), mots-gs.json (generic GS words)
│   ├── ce2/                         # CE2 track: method.js (compensation solver), generators.js (levels), rules.js
│   │                                #   (ladder, session), app.js, parent.js, ce2.css
│   ├── jeu/                         # CE2 game: questions.js (24 skills, generators + French banks), rules.js (biomes, ladder,
│   │                                #   expeditions, village), world.js (geometry), app.js (canvas, input, overlays), jeu.css
│   ├── en/                          # English track: app.js, parent.js, rules.js, generators.js, pronounce.js, listen.js;
│   │   │                            #   lessons from photos: answer.js, ladder.js, lesson-session.js,
│   │   │                            #   lesson-generators.js, lesson-play.js, lesson-report.js, today.js
│   │   └── decks/                   # index.js (LESSON_FILES, DECK_FILES) + one JSON per lesson / deck
│   └── audio/gs/                    # recorded mp3 clips + manifest.json + sources.json (generated)
├── tools/                           # gen-audio.mjs, cues.mjs (clip recording), trace-sheet.mjs (trace model renders), README.md
├── tests/                           # *.test.mjs (node:test), helpers/
├── ARCHITECTURE.md, README.md, CLAUDE.md
```

A quiz page is a thin shell: standardised markup + a `<script type="module">` that calls `startQuiz({ quizId, generateQuestion, validateSettings? })`. The engine handles timer, scoring, history, and celebration. Quiz-specific settings are read inside the per-page closures; the engine doesn't need to know about them.

`gs.html` is a thin shell too: markup for four screens + `assets/gs/app.js`. `assets/core/*` never imports a track, storage or the page; tracks pass their constraints in (skill names such as the trace slot and the capitals-first prerequisite are data in `GS_CONSTRAINTS` / `GS_PRACTICE`, never code). Practice themes (`assets/gs/themes.js`) are a GS concept: core's `composePractice` only receives `inTheme(id)` as an `include(card)` predicate.

## Working in this repo

- **Run `node --test` before every commit and push** (repo root, no argument: `node --test tests/` fails on Node 22.7). Tests cover pure modules only; hand-test the DOM in a browser via `python3 -m http.server 8000` (modules and deck `fetch` need a real origin).
- **`main` is production.** Push to `main` = deploy; a broken push = broken live site for the kids. Verify locally before pushing.
- **"Here are photos of a lesson" → follow [README.md](README.md#photos--lesson-revise-for-a-test).** One lesson file, no code change: read the photos, tell the parent what the lesson contains and which mistakes the notebook has, write `assets/en/decks/<id>.json` with the *correct* English (the child's slips go in `slips` only), add it to `LESSON_FILES`, `node --test`, push. Never commit the photos (`inbox/` and scratch folders only). Never rename an existing item id (progress on the iPad is keyed by it).
- **Storage goes through `assets/storage.js` only.** Don't call `localStorage` directly from a page; that's how the schema stays migratable.
- **Don't introduce a build step, framework, or package manager** without a concrete reason. The "push to deploy" simplicity is load-bearing (that includes no `package.json` just to silence a Node warning).
- **Bootstrap 5.3 from CDN with SRI hashes pinned.** If you bump the version, recompute the SRI hashes (`curl … | openssl dgst -sha384 -binary | openssl base64 -A`) — don't drop the `integrity` attribute.
- **Spoken text = cues, one key → one text.** Changing or adding a cue text (generators, `UI_CUES`, `PAGE_CUES`) or a deck means re-running `node tools/gen-audio.mjs` and committing the clips; `tests/audio-cues.test.mjs` fails on a missing or stale clip. See [`tools/README.md`](tools/README.md).
- **Adding a word deck**: see [README.md](README.md#add-a-word-deck-one-per-période). **Adding or changing a trace model** (capital, cursive, digit): render it with `tools/trace-sheet.mjs` and look at it before shipping, see [README.md](README.md#add-or-change-a-trace-model-capital-cursive-letter-digit). **Adding a quiz**: copy an existing `<topic>.html`, change `quizId` and `generateQuestion`; pick a fresh `quizId` (it's part of the localStorage key). See [README.md](README.md#add-a-new-math-quiz).

## Conventions

- Bootstrap utility classes for layout (`card`, `container`, `mb-3`, `visually-hidden`); custom CSS only for what Bootstrap doesn't give you (animations, the timer typography, the GS screens in `assets/gs/gs.css`).
- Math quizzes: settings validation uses `alert()` with kid-friendly copy. Wrong answers are flagged with `❌` (non-color cue) plus the `.wrong-answer` class; the success line uses `✅`. Don't list every question in the result — only the misses.
- GS track: no score shown to the child (stars only); a revealed answer is never praised; nothing advances while audio plays; adult controls stay behind a long-press. Data text goes through `textContent`, never `innerHTML`.
- Result/timer regions carry `role="status"` / `role="timer"` for screen readers; keep them when editing markup.
- English lessons from photos: one card per item, the ladder level picks the exercise format (`assets/en/ladder.js`); typed inputs keep `autocorrect`, `autocapitalize`, `autocomplete` and `spellcheck` off; a miss always ends on the model answer and never blocks; the new exercises never need the microphone.
- CE2 game (`jeu.html`): the answer is the action (throw at the creature carrying it), never a quiz gate in front of an unrelated mini-game; no timer, no lives, no score; a miss ends on the model answer and the question comes back; choices stay ≤ 16 characters (they are drawn on a creature); only emoji older than 2019. It is a game in parallel: it never replaces or changes a track.
- CE2 track: the subtraction method is the class's (compensation); never show another one. Hints never give the digit before the worked solution; stars, not scores.
- Tests follow `<Method>_<Condition>_<Expectation>` names, mostly one test file per module. Running `node --test` from the main checkout also picks up `.claude/worktrees/*/tests`.
