# school

Tiny static math-quiz site for kids to practise.

## Run it

There is no build. Either open the HTML files directly, or serve the directory:

```
python3 -m http.server 8000
# http://localhost:8000/
```

A local origin is recommended — `<script type="module">` can be flaky over `file://`.

## Deploy

Hosted on **GitHub Pages directly off `main`**. Push to `main` and the live site updates. There is no CI.

## Quizzes

- `index.html` — landing page
- `multiplication.html` — multiplication-table drill (operands 1–10)
- `addition.html` — find the missing addend that sums to a chosen target

Each quiz: pick the number of questions and a timer, answer, get scored, see history of the last 5 attempts. A perfect score triggers confetti.

## Add a new quiz

1. Copy `multiplication.html` to `<topic>.html`.
2. Update `<title>` and `<h1>`.
3. In the `<script type="module">`, change the `quizId` and replace `generateQuestion` with the new math.
4. Need extra inputs? Add them to the `#settings` card and read them inside your `generateQuestion` (and optional `validateSettings`) closure.
5. Link the page from `index.html`.

Each `quizId` becomes part of a `localStorage` key — pick a unique one.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for module responsibilities, the DOM contract, the storage schema, and the seams reserved for upcoming features (profiles, difficulty, themes, sounds, badges).

## Guidance for AI agents

See [`CLAUDE.md`](CLAUDE.md).
