# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, zero-build web app the owner built for his own kids: timed math quizzes and an **English track** (`en.html`, matched to his class lessons, speech-checked pronunciation) for the older child (6e) and a spaced-repetition **Grande Section learning track** (`gs.html`: sounds, letters, syllables, tracing in capitals and cursive, numbers to 10; one daily session plus unlimited themed practice rounds) for a 5-year-old who cannot read yet. Hosted on **GitHub Pages directly off `main`** — pushing to `main` is the deploy. There is no CI, no build, no package manager, no backend; persistence is `localStorage`. Pure modules have `node:test` tests.

The audience is young learners — keep UI copy simple, validation friendly, and avoid clever abstractions that make the source harder to tweak on the fly. On the GS track every instruction must work for a non-reader (spoken, with pictures), and every French text must be correct French (typography included: non-breaking space before `! ? : ;`).

See [`README.md`](README.md) for run/deploy/test basics, the iPad setup, deck authoring and clip recording, and [`ARCHITECTURE.md`](ARCHITECTURE.md) for modules, the storage schema, the learning-track engine and the quiz DOM contract.

## Layout

```
/
├── index.html                       # "Qui joue ?" profile picker + "Autres jeux" (math quizzes)
├── multiplication.html, addition.html   # math quiz pages
├── gs.html                          # Grande Section track
├── en.html                          # 6e English track (listen-pick, say-it + pronunciation check)
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
- **Release order:** this track's branch is built on `refactor/shared-engine` (shared `storage.js`, `celebration.js`, `quiz.css` as ES modules). That refactor must land on `main` before, or together with, the GS track.
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
- Tests follow `<Method>_<Condition>_<Expectation>` names, mostly one test file per module. Running `node --test` from the main checkout also picks up `.claude/worktrees/*/tests`.
