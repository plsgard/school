# school

Tiny static learning site for the owner's kids: timed math quizzes, and a spaced-repetition **Grande Section** track (sounds, letters, syllables, tracing, numbers to 10) for a non-reading 5-year-old.

## Run it

There is no build. Serve the directory (ES modules and the deck/clip `fetch` need a real origin, `file://` does not work for `gs.html`):

```
python3 -m http.server 8000
# http://localhost:8000/
```

- `index.html` — "Qui joue ?" profile picker: one big card per child. 🦊 (Grande Section) opens `gs.html`; 🐼 (6e) opens the "Autres jeux" list, which holds the math quizzes:
  - `multiplication.html` — multiplication-table drill (operands 1–10);
  - `addition.html` — find the missing addend that sums to a chosen target.

  Each quiz: pick the number of questions and a timer, answer, get scored, see the last 5 attempts. A perfect score triggers confetti. Math history is kept under the older child's profile even when the page is opened after picking 🦊.
- `gs.html` — the Grande Section track: one short session a day (6 games by default), see below.

To test on the iPad from the Mac: same Wi-Fi, then open `http://<mac-ip>:8000/gs.html`.

## Deploy

Hosted on **GitHub Pages directly off `main`**. Push to `main` and the live site updates. There is no CI: run the tests before pushing.

## Tests

```
node --test
```

Run from the repo root, **with no argument** (Node ≥ 20, no dependencies). It discovers `tests/**/*.test.mjs`. Don't pass `tests/`: Node 22.7 treats it as a module path and fails. Only pure modules are tested (scheduler, composer, progress, generators, decks, rules, trace scorer, speech, storage, profiles, audio cues/clips); the DOM is hand-tested in a browser. The `MODULE_TYPELESS_PACKAGE_JSON` warning is expected (no `package.json` on purpose).

## iPad setup

- **Add to Home Screen** from Safari for a full-screen app. A home-screen web app keeps its **own storage**, separate from Safari: progress made in Safari does not follow it. Opened with empty storage, `gs.html` plays as the first Grande Section profile.
- **Audio starts on ▶ Jouer.** iOS only plays sound after a tap; the Jouer tap unlocks both the clips and the device voice. Nothing is spoken before a tap.
- **Voice:** pre-recorded clips are the default. If you switch the parent corner to "Voix de l'appareil", download a better French voice: Réglages › Accessibilité › Contenu énoncé › Voix › Français, then an "améliorée" (enhanced) voice; the compact default voices are hard for a 5-year-old to follow. "🔊 Tester" in the parent corner checks the selected source.
- **Pencil:** once the Apple Pencil touches a tracing canvas, finger and palm touches are ignored (they work again ~30 s after the Pencil stops).

## Parent corner and gates

Everything adult-facing hides behind a **long-press** (the button fills up while held, ~1.5 s); a child's tap does nothing:

| Where | Hold | Opens |
|---|---|---|
| `gs.html` home | ⚙️ | "Coin des parents": first name, games per session (5–8), "Mode accompagné" (parent mode), audio source ("Clips enregistrés" / "Voix de l'appareil" / "Aucune voix (un adulte lit)") and device voice, today's session (one per day; "Autoriser une autre partie aujourd'hui" allows one more), Leitner boxes, decks, the week's results and words to watch |
| `gs.html` home | 🦊 | back to the profile picker |
| `index.html` | ✏️ | rename each child (one name per child: the card name and the game's first name stay in sync) |

During a session, 🏠 quits on a 0.8 s hold or two taps within 2 s; a single stray tap does nothing.

## Grande Section track

`gs.html` + `assets/gs/`, on top of the shared engine in `assets/core/` (see [`ARCHITECTURE.md`](ARCHITECTURE.md#learning-tracks)). Decks are JSON in `assets/gs/decks/`: `letters.json` and `numbers.json` are invariant; words come as one deck per période (`mots-p1.json`).

### Add a word deck (one per période)

1. Create `assets/gs/decks/mots-p2.json` (copy `mots-p1.json`; the item below is one of its entries):
   ```json
   { "id": "mots-p2", "kind": "words", "label": "Mots · période 2", "items": [
    { "id": "fusee", "text": "fusée", "emoji": "🚀", "syll": ["fu","zée"], "syllW": ["fu","sée"], "initial": "f", "rhyme": "é" }
   ]}
   ```
   - `id`: ASCII, no accents (it is part of clip paths and card ids); `text`: the written word.
   - `emoji`: must be **unambiguous for a 5-year-old** (no emoji that could be another word — no 🚿 for "lavabo"); unique in the deck, and never 🏠 🌙 ⭐ 🔊 (page controls). No good emoji → no word.
   - `syll`: the **oral** syllables, as they are said (`fu, zée`, `pa, pi, yon`); they are spoken, so spell them for the voice. `syllW`: the **written** syllables, only when the written cut differs (`fu-sée`, `pa-pil-lon`); shown on screen.
   - `initial`: the first sound (`l`, `ch`, `b`…), which must also be how the word is **written** at the start: `sound-letter` stretches it in front of the rest of the spelling (`fffusée`), so a "cerise" with initial `s` would break. It drives `sound-pick` (the right answer is another word with the same initial when there is one) and, when the letter is a continuant of `letters.json`, the letter's `sound-letter` example words — new stretched clips to check by ear (below).
   - `rhyme`: the final sound (`in`, `o`, `on`…). A word gets a `rhyme` card only if another word of the deck shares its rhyme, and a `syll-match` card only if another shares its first oral syllable.
   - **Vowel-initial words** ("avion", "école") are not supported yet: prompts such as "comme au début de …" would need elision ("d'avion") in `assets/gs/generators.js` first.
2. Register it in `DECK_FILES` in `assets/gs/decks/index.js` (deck order = teaching order).
3. Record its clips: `node tools/gen-audio.mjs` (macOS `say` + `ffmpeg`; only new or changed cues are recorded — see [`tools/README.md`](tools/README.md)).
4. `node --test`. `tests/audio-cues.test.mjs` fails if a cue the generators can emit has no clip in `manifest.json`, or if a clip is stale (recorded from an older text). `tests/decks.test.mjs` checks the shipped `mots-p1` deck only: extend it to the new deck.
5. Commit the deck, `manifest.json`, `sources.json` and the new mp3 files together.

### Clips to check by ear

Stretched sounds ("fff", "chchch", "le son beu", "Colle les sons…") were recorded from adapted TTS input (`assets/gs/say.js`) and nobody has listened to them yet. These **145 clips** must be checked by ear; the voiced continuants (`j`, `z`, `v`, `l`, `m`, `n`, `r`) are the most at risk.

**Re-record one as manual:** save the mp3 at `assets/audio/gs/<key with '.' replaced by '/'>.mp3` (mono, 32 kbps is enough; e.g. `ui.blend.fa` → `assets/audio/gs/ui/blend/fa.mp3`), then set its entry in `assets/audio/gs/sources.json` to `{ "manual": true, "text": "<the cue text it says>" }`. `gen-audio.mjs` never overwrites a manual clip (only `--only <key> --force` does) and reports it as `STALE` when the cue text changes.

<details>
<summary>The 145 keys</summary>

- `ui.sound-pick.b`, `ui.sound-pick.ch`, `ui.sound-pick.f`, `ui.sound-pick.k`, `ui.sound-pick.l`, `ui.sound-pick.m`, `ui.sound-pick.p`, `ui.sound-pick.r`, `ui.sound-pick.s`, `ui.sound-pick.v`
- `ui.sound-pick-ok.ballon`, `ui.sound-pick-ok.banane`, `ui.sound-pick-ok.bateau`, `ui.sound-pick-ok.chapeau`, `ui.sound-pick-ok.chat`, `ui.sound-pick-ok.fusee`, `ui.sound-pick-ok.kiwi`, `ui.sound-pick-ok.lama`, `ui.sound-pick-ok.lapin`, `ui.sound-pick-ok.maison`, `ui.sound-pick-ok.moto`, `ui.sound-pick-ok.papillon`, `ui.sound-pick-ok.raisin`, `ui.sound-pick-ok.sapin`, `ui.sound-pick-ok.souris`, `ui.sound-pick-ok.velo`, `ui.sound-pick-ok.voiture`
- `ui.sound-letter.a`, `ui.sound-letter.e`, `ui.sound-letter.f.fusee`, `ui.sound-letter.i`, `ui.sound-letter.j`, `ui.sound-letter.l.lama`, `ui.sound-letter.l.lapin`, `ui.sound-letter.m.maison`, `ui.sound-letter.m.moto`, `ui.sound-letter.n`, `ui.sound-letter.o`, `ui.sound-letter.r.raisin`, `ui.sound-letter.s.sapin`, `ui.sound-letter.s.souris`, `ui.sound-letter.u`, `ui.sound-letter.v.velo`, `ui.sound-letter.v.voiture`, `ui.sound-letter.z`
- `ui.sound-letter-ok.a`, `ui.sound-letter-ok.e`, `ui.sound-letter-ok.i`, `ui.sound-letter-ok.j`, `ui.sound-letter-ok.n`, `ui.sound-letter-ok.o`, `ui.sound-letter-ok.u`, `ui.sound-letter-ok.z`
- `ui.blend.fa`, `ui.blend.fe`, `ui.blend.fi`, `ui.blend.fo`, `ui.blend.fu`, `ui.blend.ja`, `ui.blend.je`, `ui.blend.ji`, `ui.blend.jo`, `ui.blend.ju`, `ui.blend.la`, `ui.blend.le`, `ui.blend.li`, `ui.blend.lo`, `ui.blend.lu`, `ui.blend.ma`, `ui.blend.me`, `ui.blend.mi`, `ui.blend.mo`, `ui.blend.mu`, `ui.blend.na`, `ui.blend.ne`, `ui.blend.ni`, `ui.blend.no`, `ui.blend.nu`, `ui.blend.ra`, `ui.blend.re`, `ui.blend.ri`, `ui.blend.ro`, `ui.blend.ru`, `ui.blend.sa`, `ui.blend.se`, `ui.blend.si`, `ui.blend.so`, `ui.blend.su`, `ui.blend.va`, `ui.blend.ve`, `ui.blend.vi`, `ui.blend.vo`, `ui.blend.vu`, `ui.blend.za`, `ui.blend.ze`, `ui.blend.zi`, `ui.blend.zo`, `ui.blend.zu`
- `ui.blend-ok.fa`, `ui.blend-ok.fe`, `ui.blend-ok.fi`, `ui.blend-ok.fo`, `ui.blend-ok.fu`, `ui.blend-ok.ja`, `ui.blend-ok.je`, `ui.blend-ok.ji`, `ui.blend-ok.jo`, `ui.blend-ok.ju`, `ui.blend-ok.la`, `ui.blend-ok.le`, `ui.blend-ok.li`, `ui.blend-ok.lo`, `ui.blend-ok.lu`, `ui.blend-ok.ma`, `ui.blend-ok.me`, `ui.blend-ok.mi`, `ui.blend-ok.mo`, `ui.blend-ok.mu`, `ui.blend-ok.na`, `ui.blend-ok.ne`, `ui.blend-ok.ni`, `ui.blend-ok.no`, `ui.blend-ok.nu`, `ui.blend-ok.ra`, `ui.blend-ok.re`, `ui.blend-ok.ri`, `ui.blend-ok.ro`, `ui.blend-ok.ru`, `ui.blend-ok.sa`, `ui.blend-ok.se`, `ui.blend-ok.si`, `ui.blend-ok.so`, `ui.blend-ok.su`, `ui.blend-ok.va`, `ui.blend-ok.ve`, `ui.blend-ok.vi`, `ui.blend-ok.vo`, `ui.blend-ok.vu`, `ui.blend-ok.za`, `ui.blend-ok.ze`, `ui.blend-ok.zi`, `ui.blend-ok.zo`, `ui.blend-ok.zu`
- `syl.za`, `syl.zi`

</details>

## Add a new math quiz

1. Copy `multiplication.html` to `<topic>.html`.
2. Update `<title>` and `<h1>`.
3. In the `<script type="module">`, change the `quizId` and replace `generateQuestion` with the new math.
4. Need extra inputs? Add them to the `#settings` card and read them inside your `generateQuestion` (and optional `validateSettings`) closure.
5. Link the page from the "Autres jeux" list in `index.html`.

Each `quizId` becomes part of a `localStorage` key — pick a unique one.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for modules, the storage schema, the learning-track engine (composer, Leitner, audio, child UX rules) and the quiz DOM contract.

## Guidance for AI agents

See [`CLAUDE.md`](CLAUDE.md).
