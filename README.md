# school

Tiny static learning site for the owner's kids: timed math quizzes, and a spaced-repetition **Grande Section** track (sounds, letters, syllables, tracing in capitals and cursive, numbers to 10) for a non-reading 5-year-old, with one daily session and unlimited practice rounds by theme.

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
- `gs.html` — the Grande Section track: one short session a day (6 games by default) plus practice rounds by theme, see [Home and practice](#home-and-practice).

To test on the iPad from the Mac: same Wi-Fi, then open `http://<mac-ip>:8000/gs.html`.

## Deploy

Hosted on **GitHub Pages directly off `main`**. Push to `main` and the live site updates. There is no CI: run the tests before pushing.

## Tests

```
node --test
```

Run from the repo root, **with no argument** (Node ≥ 20, no dependencies). It discovers `tests/**/*.test.mjs`. Don't pass `tests/`: Node 22.7 treats it as a module path and fails. Only pure modules are tested (scheduler, daily and practice composers, progress, generators, decks, themes, rules, trace geometry, scorer and models, trace-sheet, speech, storage, profiles, audio cues/clips); the DOM is hand-tested in a browser. The `MODULE_TYPELESS_PACKAGE_JSON` warning is expected (no `package.json` on purpose).

## iPad setup

- **Add to Home Screen** from Safari for a full-screen app. A home-screen web app keeps its **own storage**, separate from Safari: progress made in Safari does not follow it. Opened with empty storage, `gs.html` plays as the first Grande Section profile (Apolline).
- **Audio starts with a tap.** iOS only plays sound after a tap; ▶ Jouer, a theme button and 🔁 Encore each unlock both the clips and the device voice. Nothing is spoken before a tap.
- **Voice:** pre-recorded clips are the default. If you switch the parent corner to "Voix de l'appareil", download a better French voice: Réglages › Accessibilité › Contenu énoncé › Voix › Français, then an "améliorée" (enhanced) voice; the compact default voices are hard for a 5-year-old to follow. "🔊 Tester" in the parent corner checks the selected source.
- **Pencil:** once the Apple Pencil touches a tracing canvas, finger and palm touches are ignored (they work again ~30 s after the Pencil stops).
- **Tracing:** each stroke starts at a numbered, coloured dot (1 green, 2 blue, 3 orange, 4 violet) and follows the grey path in the direction of the arrows. When one stroke is done, the voice says where to start the next one ("Maintenant, pars du point bleu !"); waiting there is never counted as a mistake. Capitals go from the top line down to the baseline; cursive letters and digits use the tinted band (x-height) and the baseline.

## Home and practice

The `gs.html` home has two ways to play:

- **▶ Jouer: the daily session.** 6 games by default, one per day: afterwards ▶ Jouer becomes 🌙 ("À demain"). It is the main path: it introduces new material and follows the Leitner schedule.
- **Four theme buttons under it: practice rounds.** 👂 Sons (syllables, rhymes, first and last sounds, blending), 🔤 Lettres (letters, letter sounds, the first name), ✏️ Écrire (tracing capitals, cursive letters and digits), 🔢 Nombres (counting, comparing, dice, before/after, adding…). Each starts a round of 6 games of that theme (6–10, set in the parent corner). Rounds are **unlimited and never count as the day's game**: ▶ Jouer stays available until the daily session is played, and the theme buttons stay after it. A round replays what she already knows (due cards first, then the weakest), with at most one new card, taken from the same daily allowance as the session. A theme she has barely met is filled with "preview" games, played for exposure and not recorded. The done screen offers 🔁 Encore (another round of the same theme, with different cards first) and 🏠.

A right answer in practice on a card that is not due yet earns a star but does not move the card up a box; a wrong answer moves it down, as in the daily session.

## Parent corner and gates

Everything adult-facing hides behind a **long-press** (the button fills up while held, ~1.5 s); a child's tap does nothing:

| Where | Hold | Opens |
|---|---|---|
| `gs.html` home | ⚙️ | "Coin des parents": first name, games per session (5–8), games per practice round ("Nombre de jeux par entraînement", 6–10), "Mode accompagné" (parent mode), audio source ("Clips enregistrés" / "Voix de l'appareil" / "Aucune voix (un adulte lit)") and device voice, today's session (one per day; "Autoriser une autre partie aujourd'hui" allows one more), Leitner boxes, decks, the week's results and cards to watch (≥ 2 errors) |
| `gs.html` home | 🦊 | back to the profile picker |
| `index.html` | ✏️ | rename each child (one name per child: the card name and the game's first name stay in sync) |

The week's results ("Cette semaine") have one line for the daily sessions and one for practice, for example "Entraînements : 8 parties (👂 1 · 🔤 1 · ✏️ 1 · 🔢 5) · 29 % du premier coup" (rounds per theme; preview games are not in the percentage), or "Aucun entraînement cette semaine.".

During a session or a round, 🏠 quits on a 0.8 s hold or two taps within 2 s; a single stray tap does nothing. What was answered before quitting is kept.

The profile picker is seeded with the children's names, Apolline (🦊, Grande Section) and Louis (🐼, 6e). A device that still has the old "Enfant 1" / "Enfant 2" placeholders gets the real names on its next visit; a name a parent changed is kept.

## Grande Section track

`gs.html` + `assets/gs/`, on top of the shared engine in `assets/core/` (see [`ARCHITECTURE.md`](ARCHITECTURE.md#learning-tracks)). Decks are JSON in `assets/gs/decks/`, registered in `DECK_FILES` (`assets/gs/decks/index.js`) in teaching order:

- `letters.json` and `numbers.json`: invariant (letters with their sounds, cursive and capital trace models; numbers 1–10, then 0, with digit trace models);
- `mots-p1.json` ("Mots · période 1"): the words of the class's first période; the contract is one deck per période;
- `mots-gs.json` ("Mots de Grande Section"): 17 generic, invariant GS words (robot, gâteau, château, chameau, fourmi, lit, savon, salade, mouton, requin, dauphin, vache, bébé, nez, tambour, tortue, tomate). It is kept apart from the période decks so the next période can replace `mots-p1` without touching it.

### Add a word deck (one per période)

1. Create `assets/gs/decks/mots-p2.json` (copy `mots-p1.json` and replace every item):
   ```json
   { "id": "mots-p2", "kind": "words", "label": "Mots · période 2", "items": [
    { "id": "tortue", "text": "tortue", "emoji": "🐢", "syll": ["tor","tue"], "initial": "t", "rhyme": "u", "final": "u" }
   ]}
   ```
   - `id`: ASCII, no accents, unique across all word decks (clip keys don't include the deck id); `text`: the written word.
   - `emoji`: must be **unambiguous for a 5-year-old** (no emoji that could be another word — no 🚿 for "lavabo", no 🐔 poule/poulet); unique across all word decks; distractors are drawn from every word deck; never a page control or theme button (🏠 🌙 🔊 ⚙️ 🎉 ✔ and 👂 🔤 ✏️ 🔢), a profile avatar (🦊 🐼), a counted object (`OBJECTS` in `generators.js`) or a pattern symbol (`PATTERN_NAMES`, ⭐ included); `tests/decks.test.mjs` checks it. No good emoji → no word.
   - `syll`: the **oral** syllables, as they are said (`fu, zée`, `pa, pi, yon`, `reu, quin`); they are spoken one by one (`syl.<word>.<i>` clips), so spell them for the voice. `syllW`: the **written** syllables, only when the written cut differs (`fu-sée`, `pa-pil-lon`, `re-quin`); shown on screen, and `(syllW ?? syll).join('')` must give `text`. A word with 2 syllables or more gets a `syll-initial` card ("Par quelle syllabe commence…"): its tiles show the written syllable and say the oral one.
   - `initial`: the first sound (`l`, `ch`, `b`…), which must also be how the word is **written** at the start: `sound-letter` stretches it in front of the rest of the spelling (`fffusée`), so a "cerise" with initial `s` or a "girafe" with initial `g` would break. It drives `sound-pick` (the right answer is another word with the same initial when there is one) and, when the letter is a continuant of `letters.json`, the letter's `sound-letter` example words — new stretched clips to check by ear (below).
   - `rhyme`: the final sound group (`in`, `o`, `on`…). A word gets a `rhyme` card only if another word of **the same deck** shares its rhyme, and a `syll-match` card only if another shares its first oral syllable.
   - `final` (required): the last **sound** of the word, for `sound-final` ("Quel mot finit par…"): a vowel `a i o u é`, a continuant `l m n r s v z j ch f`, or an occlusive `p b t d k g`. Mute letters do not count (souris → `i`, chat → `a`, nez → `é`, robot → `o`). `null` when the word ends with a nasal vowel or `ou` (lapin, maison, mouton, loup): those cannot be shown or stretched as one letter, so the word gets no `sound-final` card (it can still be a distractor). The deck test only accepts `null` with a rhyme in `in`, `on`, `an`, `en`, `ou`, `oin`.
   - **What "sounds the same" means** (`heard()` in `assets/gs/generators.js`): syllable tiles and `syll-match` compare syllables as heard, not as written: `eau`/`au` → `o`, `ée` → `é`, a final `ez`/`er` → `é`, `ai`/`ei`/`ê` → `è`, accents on `â ô î û` dropped, `ph` → `f`, `qu` → `k`, soft `c`/`g` before e/i → `s`/`j`, a mute final `t s d x z p` after a vowel dropped, a final `e` after a consonant dropped. So `chat` = `cha` and `teau` = `to`, but `lade` ≠ `la`. A new deck with other spellings (`ein`, `ai` in the middle…) may need a rule there.
   - **Vowel-initial words** ("avion", "école") are not supported yet: prompts such as "comme au début de …" would need elision ("d'avion") in `assets/gs/generators.js` first.
2. Register it in `DECK_FILES` in `assets/gs/decks/index.js` (deck order = teaching order).
3. Record its clips: `node tools/gen-audio.mjs` (macOS `say` + `ffmpeg`; only new or changed cues are recorded — see [`tools/README.md`](tools/README.md)).
4. `node --test`. `tests/audio-cues.test.mjs` fails if a cue the generators can emit has no clip in `manifest.json`, or if a clip is stale (recorded from an older text). `tests/decks.test.mjs` checks every word deck of `DECK_FILES` (ids, emoji, written start, `syllW`, `final`); add the new deck's own partner checks if you rely on them, as `motsGs_Deck_HasInternalSyllAndRhymePartners` does.
5. Commit the deck, `assets/gs/decks/index.js`, the test changes, `manifest.json`, `sources.json` and the new mp3 files together.

### Add or change a trace model (capital, cursive letter, digit)

Models are data in the decks, in a 100 × 100 box: `letters.json` `capTrace` (capitals: an **array of strokes**, 1 to 4) and `trace` (+ `trace2` for x, `dot` for i and j, `bar` for t); `numbers.json` `trace` (+ `trace2` for 4 and 5, `bar` for 7, `dirOrder: "top-first"` for 8). Each stroke is a list of `[x, y]` waypoints; its first point is the start dot.

1. **Follow the conventions** (most are tested in `tests/trace-models.test.mjs`):
   - **Capitals** (capitales d'imprimerie), between the cap line 16 and the baseline 72 (Q's tail may go to 78), x 14–86: one straight line or one curve per stroke; vertical and oblique lines top → bottom, horizontal lines left → right; round letters (C G O Q S) start at the top and go counter-clockwise; stroke order: the highest start first, then the leftmost, bars after the lines they join. At least 4 points per stroke, at most 12 apart; space the points of a straight stroke evenly (uneven steps make the grey path wobble).
   - **Cursive letters** (French school cursive) on the x-height band 42–72: an entry stroke from the baseline on the left (the round letters a c d g o q start on the round instead, counter-clockwise), an exit stroke at the end; loops of b f h k l up to 16, descenders down to 92.
   - **Digits** (maternelle formation): body x 34–66, top on 30, baseline 72, no ligatures.
   - An open stroke must end ≥ 15 from its start (so a reversed stroke fails); a closed stroke (end < 12.6 from the start: O, Q's ring, 0, 8) is checked by turning direction instead.
2. **Render and look** at it: `node tools/trace-sheet.mjs --deck caps --only e --points` (`--deck letters` / `numbers` / `all`; `--state k` shows the dots once k strokes are done; default output in the OS temp dir, or `--out DIR`), then `qlmanage -t -s 400 -o DIR DIR/caps-e.svg` and open the PNG. Check the start dots and their numbers, the stroke order, the arrows, the lines (top and bottom) and the proportions; adjust the points and render again. Run once without `--only` and look at the contact sheet (`sheet-caps.svg`) last, for consistent sizes.
3. **Tests:** `node --test`. For a capital, update `CAP_COUNTS` in `tests/trace-models.test.mjs` when the number of strokes changes, and the list of corners in `capModels_CornersDrawnWithoutLifting_AreOk` when a stroke now ends where the next one starts (today b2, k2, l1, r2, y2, z1, z2: there the child may go on without lifting).
4. A new capital or digit model needs no new clip; a new letter does (`node tools/gen-audio.mjs`).

### Clips to check by ear

Nobody has listened to the clips built from adapted TTS input yet. These **263 clips** must be checked by ear:

- **186** recorded from adapted TTS input: stretched sounds ("fff", "chchch", "ééé", "Colle les sons…"), including the final sounds sent with a trailing schwa ("chchchchchcheu", "rrrrrreu", "nnnnnneu"; "jjjjjjeu" is only in `ui.sound-letter.j` now that *nuage* is gone);
- **21** plain-TTS "le son beu / teu / deu / gueu…" prompts and success lines;
- **56** others flagged during the build: syllables spelled for the voice or read alone (`reu`, `zée`, `nane`, `teau`, `meau`, `ture`, `lade`, `tue`, `gâ`, `phin`, `bo`, `lit`, `nez`, `vache`, `tam`, `bour`), `word.tambour`, the "château / chameau et chat commencent pareil" lines, the 26 capital prompts (letter names "a", "double vé", "i grec"…), "ache" in `ui.trace-cap-ok.h`, the three next-dot colour cues and the five practice cues.

Most at risk: the voiced continuants (`j`, `z`, `v`, `l`, `m`, `n`, `r`), where the measurement cannot tell a stretch from a spelled letter, and `ui.sound-final.eacute` ("Quel mot finit par ééé ?"), which lasts 6.5 s: check that the é is not overlong.

**Re-record one as manual:** save the mp3 at `assets/audio/gs/<key with '.' replaced by '/'>.mp3` (mono, 32 kbps is enough; e.g. `ui.blend.fa` → `assets/audio/gs/ui/blend/fa.mp3`), then set its entry in `assets/audio/gs/sources.json` to `{ "manual": true, "text": "<the cue text it says>" }`. The `text` must be byte-identical to the cue text, U+00A0 included: copy it exactly (the `STALE` message prints it). `gen-audio.mjs` never overwrites a manual clip (only `--only <key> --force` does) and reports it as `STALE` when the cue text changes.

<details>
<summary>The 263 keys</summary>

- `ui.sound-pick.b`, `ui.sound-pick.ch`, `ui.sound-pick.d`, `ui.sound-pick.f`, `ui.sound-pick.g`, `ui.sound-pick.k`, `ui.sound-pick.l`, `ui.sound-pick.m`, `ui.sound-pick.n`, `ui.sound-pick.p`, `ui.sound-pick.r`, `ui.sound-pick.s`, `ui.sound-pick.t`, `ui.sound-pick.v`
- `ui.sound-pick-ok.ballon`, `ui.sound-pick-ok.banane`, `ui.sound-pick-ok.bateau`, `ui.sound-pick-ok.bebe`, `ui.sound-pick-ok.chameau`, `ui.sound-pick-ok.chapeau`, `ui.sound-pick-ok.chat`, `ui.sound-pick-ok.chateau`, `ui.sound-pick-ok.dauphin`, `ui.sound-pick-ok.fourmi`, `ui.sound-pick-ok.fusee`, `ui.sound-pick-ok.gateau`, `ui.sound-pick-ok.kiwi`, `ui.sound-pick-ok.lama`, `ui.sound-pick-ok.lapin`, `ui.sound-pick-ok.lit`, `ui.sound-pick-ok.maison`, `ui.sound-pick-ok.moto`, `ui.sound-pick-ok.mouton`, `ui.sound-pick-ok.nez`, `ui.sound-pick-ok.papillon`, `ui.sound-pick-ok.raisin`, `ui.sound-pick-ok.requin`, `ui.sound-pick-ok.robot`, `ui.sound-pick-ok.salade`, `ui.sound-pick-ok.sapin`, `ui.sound-pick-ok.savon`, `ui.sound-pick-ok.souris`, `ui.sound-pick-ok.tambour`, `ui.sound-pick-ok.tomate`, `ui.sound-pick-ok.tortue`, `ui.sound-pick-ok.vache`, `ui.sound-pick-ok.velo`, `ui.sound-pick-ok.voiture`
- `ui.sound-final.a`, `ui.sound-final.ch`, `ui.sound-final.d`, `ui.sound-final.eacute`, `ui.sound-final.i`, `ui.sound-final.n`, `ui.sound-final.o`, `ui.sound-final.r`, `ui.sound-final.t`, `ui.sound-final.u`
- `ui.sound-final-ok.banane`, `ui.sound-final-ok.bateau`, `ui.sound-final-ok.bebe`, `ui.sound-final-ok.chameau`, `ui.sound-final-ok.chapeau`, `ui.sound-final-ok.chat`, `ui.sound-final-ok.chateau`, `ui.sound-final-ok.fourmi`, `ui.sound-final-ok.fusee`, `ui.sound-final-ok.gateau`, `ui.sound-final-ok.kiwi`, `ui.sound-final-ok.lama`, `ui.sound-final-ok.lit`, `ui.sound-final-ok.moto`, `ui.sound-final-ok.nez`, `ui.sound-final-ok.robot`, `ui.sound-final-ok.salade`, `ui.sound-final-ok.souris`, `ui.sound-final-ok.tambour`, `ui.sound-final-ok.tomate`, `ui.sound-final-ok.tortue`, `ui.sound-final-ok.vache`, `ui.sound-final-ok.velo`, `ui.sound-final-ok.voiture`
- `ui.sound-letter.a`, `ui.sound-letter.e`, `ui.sound-letter.f.fourmi`, `ui.sound-letter.f.fusee`, `ui.sound-letter.i`, `ui.sound-letter.j`, `ui.sound-letter.l.lama`, `ui.sound-letter.l.lapin`, `ui.sound-letter.l.lit`, `ui.sound-letter.m.maison`, `ui.sound-letter.m.moto`, `ui.sound-letter.m.mouton`, `ui.sound-letter.n.nez`, `ui.sound-letter.o`, `ui.sound-letter.r.raisin`, `ui.sound-letter.r.requin`, `ui.sound-letter.r.robot`, `ui.sound-letter.s.salade`, `ui.sound-letter.s.sapin`, `ui.sound-letter.s.savon`, `ui.sound-letter.s.souris`, `ui.sound-letter.u`, `ui.sound-letter.v.vache`, `ui.sound-letter.v.velo`, `ui.sound-letter.v.voiture`, `ui.sound-letter.z`
- `ui.sound-letter-ok.a`, `ui.sound-letter-ok.e`, `ui.sound-letter-ok.i`, `ui.sound-letter-ok.j`, `ui.sound-letter-ok.o`, `ui.sound-letter-ok.u`, `ui.sound-letter-ok.z`
- `ui.blend.fa`, `ui.blend.fe`, `ui.blend.fi`, `ui.blend.fo`, `ui.blend.fu`, `ui.blend.ja`, `ui.blend.je`, `ui.blend.ji`, `ui.blend.jo`, `ui.blend.ju`, `ui.blend.la`, `ui.blend.le`, `ui.blend.li`, `ui.blend.lo`, `ui.blend.lu`, `ui.blend.ma`, `ui.blend.me`, `ui.blend.mi`, `ui.blend.mo`, `ui.blend.mu`, `ui.blend.na`, `ui.blend.ne`, `ui.blend.ni`, `ui.blend.no`, `ui.blend.nu`, `ui.blend.ra`, `ui.blend.re`, `ui.blend.ri`, `ui.blend.ro`, `ui.blend.ru`, `ui.blend.sa`, `ui.blend.se`, `ui.blend.si`, `ui.blend.so`, `ui.blend.su`, `ui.blend.va`, `ui.blend.ve`, `ui.blend.vi`, `ui.blend.vo`, `ui.blend.vu`, `ui.blend.za`, `ui.blend.ze`, `ui.blend.zi`, `ui.blend.zo`, `ui.blend.zu`
- `ui.blend-ok.fa`, `ui.blend-ok.fe`, `ui.blend-ok.fi`, `ui.blend-ok.fo`, `ui.blend-ok.fu`, `ui.blend-ok.ja`, `ui.blend-ok.je`, `ui.blend-ok.ji`, `ui.blend-ok.jo`, `ui.blend-ok.ju`, `ui.blend-ok.la`, `ui.blend-ok.le`, `ui.blend-ok.li`, `ui.blend-ok.lo`, `ui.blend-ok.lu`, `ui.blend-ok.ma`, `ui.blend-ok.me`, `ui.blend-ok.mi`, `ui.blend-ok.mo`, `ui.blend-ok.mu`, `ui.blend-ok.na`, `ui.blend-ok.ne`, `ui.blend-ok.ni`, `ui.blend-ok.no`, `ui.blend-ok.nu`, `ui.blend-ok.ra`, `ui.blend-ok.re`, `ui.blend-ok.ri`, `ui.blend-ok.ro`, `ui.blend-ok.ru`, `ui.blend-ok.sa`, `ui.blend-ok.se`, `ui.blend-ok.si`, `ui.blend-ok.so`, `ui.blend-ok.su`, `ui.blend-ok.va`, `ui.blend-ok.ve`, `ui.blend-ok.vi`, `ui.blend-ok.vo`, `ui.blend-ok.vu`, `ui.blend-ok.za`, `ui.blend-ok.ze`, `ui.blend-ok.zi`, `ui.blend-ok.zo`, `ui.blend-ok.zu`
- `syl.banane.2`, `syl.bateau.2`, `syl.chameau.2`, `syl.chateau.2`, `syl.dauphin.2`, `syl.fusee.2`, `syl.gateau.1`, `syl.gateau.2`, `syl.lit.1`, `syl.nez.1`, `syl.requin.1`, `syl.robot.2`, `syl.salade.2`, `syl.tambour.1`, `syl.tambour.2`, `syl.tortue.2`, `syl.vache.1`, `syl.voiture.2`, `syl.za`, `syl.zi`
- `word.tambour`
- `ui.syll-match-ok.chameau.chat`, `ui.syll-match-ok.chateau.chat`
- `ui.trace-cap.a`, `ui.trace-cap.b`, `ui.trace-cap.c`, `ui.trace-cap.d`, `ui.trace-cap.e`, `ui.trace-cap.f`, `ui.trace-cap.g`, `ui.trace-cap.h`, `ui.trace-cap.i`, `ui.trace-cap.j`, `ui.trace-cap.k`, `ui.trace-cap.l`, `ui.trace-cap.m`, `ui.trace-cap.n`, `ui.trace-cap.o`, `ui.trace-cap.p`, `ui.trace-cap.q`, `ui.trace-cap.r`, `ui.trace-cap.s`, `ui.trace-cap.t`, `ui.trace-cap.u`, `ui.trace-cap.v`, `ui.trace-cap.w`, `ui.trace-cap.x`, `ui.trace-cap.y`, `ui.trace-cap.z`
- `ui.trace-cap-ok.h`
- `ui.trace-blue`
- `ui.trace-orange`
- `ui.trace-violet`
- `ui.practice.ecrire`, `ui.practice.lettres`, `ui.practice.nombres`, `ui.practice.sons`
- `ui.practice-done`

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
