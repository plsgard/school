# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, zero-build web app of math quizzes the owner built for his own kids to practise with. Hosted on **GitHub Pages directly off `main`** — pushing to `main` is the deploy. There is no CI, no build, no test framework, no backend; persistence is `localStorage`.

The audience is young learners — keep UI copy simple, validation friendly, and avoid clever abstractions that make the source harder to tweak on the fly.

See [`README.md`](README.md) for run/deploy basics and [`ARCHITECTURE.md`](ARCHITECTURE.md) for module responsibilities, the DOM contract, the storage schema, and the seams reserved for upcoming features.

## Layout

```
/
├── index.html, multiplication.html, addition.html   # pages
├── assets/
│   ├── quiz.js          # engine (Settings → Quiz → Result → History flow)
│   ├── storage.js       # versioned, namespaced localStorage layer
│   ├── celebration.js   # confetti + congrats overlay
│   └── quiz.css         # shared styles
├── ARCHITECTURE.md, README.md, CLAUDE.md
```

A quiz page is a thin shell: standardised markup + a `<script type="module">` that calls `startQuiz({ quizId, generateQuestion, validateSettings? })`. The engine handles timer, scoring, history, and celebration. Quiz-specific settings are read inside the per-page closures; the engine doesn't need to know about them.

## Working in this repo

- **No build, no tests.** Hand-test in a browser. `python3 -m http.server 8000` to serve a real origin (modules can misbehave over `file://`).
- **`main` is production.** A broken push = broken live site for the kids. Verify locally before pushing.
- **Storage goes through `assets/storage.js` only.** Don't call `localStorage` directly from a page; that's how the schema stays migratable.
- **Bootstrap 5.3 from CDN with SRI hashes pinned.** If you bump the version, recompute the SRI hashes (`curl … | openssl dgst -sha384 -binary | openssl base64 -A`) — don't drop the `integrity` attribute.
- **Don't introduce a build step, framework, or package manager** without a concrete reason. The "push to deploy" simplicity is load-bearing.
- **Adding a quiz**: copy an existing `<topic>.html`, change `quizId` and `generateQuestion`. Pick a fresh `quizId` — it's part of the localStorage key. See [README.md](README.md#add-a-new-quiz).

## Conventions

- Bootstrap utility classes for layout (`card`, `container`, `mb-3`, `visually-hidden`); custom CSS only for what Bootstrap doesn't give you (animations, the timer typography).
- Settings validation uses `alert()` with kid-friendly copy. Keep that style.
- Wrong answers are flagged with `❌` (non-color cue) plus the `.wrong-answer` class. The success line uses `✅`. Don't list every question in the result — only the misses.
- Result/timer regions carry `role="status"` / `role="timer"` for screen readers; keep them when editing markup.
