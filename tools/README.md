# tools

## `node tools/gen-audio.mjs` — pre-recorded French clips for the Grande Section track

Records one mp3 per spoken cue into `assets/audio/gs/<key with dots as slashes>.mp3` (the path
`createClipSource` requests) and writes:

- `manifest.json` — sorted array of the cue keys that have a clip (the page loads it; a key not listed falls back to the device voice);
- `sources.json` — the recipe of every clip (text sent to the engine, engine, voice, rate, bitrate).

Idempotent: a clip is recorded only when it is missing or its recipe changed (edit a cue text, re-run, only that clip
is redone). Re-run after adding or changing a deck. Recording the full track from scratch takes several minutes on an M-series Mac (~4 min when it had 719 clips); a re-run with nothing to record takes ~2 s.

| Option | Default | |
|---|---|---|
| `--engine say\|openai` | `say` | `openai` needs `OPENAI_API_KEY` (`gpt-4o-mini-tts`) |
| `--voice` | `Thomas` (say) / `coral` (openai) | best installed fr_FR voice here; a Premium/Enhanced voice is better if downloaded (Réglages Système › Accessibilité › Contenu énoncé › Voix du système) |
| `--rate` | `150` | `say` words per minute (default 175): slower for a 5-year-old |
| `--bitrate` | `32k` | mono 22 kHz mp3 |
| `--only key,key` | | record only these keys (with `--force` to redo them) |
| `--force` | | re-record even if the recipe did not change |
| `--prune` | | delete clips no cue asks for any more (otherwise they are only reported) |
| `--jobs` | `6` | parallel recordings |

Requires `ffmpeg` (`brew install ffmpeg`). Temporary `.aiff` files go to the OS temp dir, never into the repo.
Changing the voice, rate or bitrate re-records everything (the recipe changed).

**Stale clips.** `tests/audio-cues.test.mjs` fails when a clip no longer matches its cue: a TTS clip whose
recorded `input` is not `sayInput(current text)`, or a manual clip whose `text` is not the current cue text. Fix: re-run
`node tools/gen-audio.mjs` (TTS clips are redone automatically). For a manual clip, the script exits non-zero with a
`STALE manual clip <key>` message: re-record it and update its `text`, or delete its `sources.json` entry to fall
back to a TTS clip. Clip keys are ASCII (e.g. `ui.pattern-choice.etoile` says "étoile").

**Size.** 1359 clips, ~58 min of speech, ~14 MB at 32 kbps (the default). Leading/trailing silence is trimmed.
`--prune` after a deck or cue change deletes the clips no cue asks for any more (e.g. the `nuage` clips when *tambour*
replaced it).

### Which cues exist (`tools/cues.mjs`)

`collectCues(cards)` builds `Map<key, text>` without any hand-written copy of a cue:

- exercise cues: every card of the shipped decks is run through `generate()` with seeded rngs until 400 seeds in a
  row bring no new key (same for `generatePattern()`); this reaches every rng-dependent key (syll-match / rhyme /
  sound-pick pairs, the 45 decompose splits, the 17 compare pairs, the 45 blend syllables, the 9 pattern colours,
  the sound-final targets, the syll-initial tiles, the dice faces, the add splits per object…);
- fixed cues: `UI_CUES` (`assets/gs/renderers.js`, collected recursively: `traceHint.*`, `traceNext[1–3]`…) and `PAGE_CUES`
  (`assets/gs/cues.js`, used by `app.js` and `parent.js`, incl. `practice.<theme>` and `practiceDone`);
- the name-spell prompt; cues with no clip (accented letters of the first name, the first-name success line `ui.name-spell-ok.<name>`) fall through to the device voice.

A key with two different texts throws. `tests/audio-cues.test.mjs` sweeps 300 other seeds and fails if any emitted
key is missing from the cues or from `manifest.json`.

### Stretched sounds: what `say` is given (`sayInput`)

`sayInput` lives in `assets/gs/say.js`: the device voice (`createDeviceSource({ transform: sayInput })`) speaks the
same adapted text at runtime. The cue text stays what the page shows; only the text sent to the engine is adapted. Measured on Thomas (duration and a
zero-crossing voiced/unvoiced profile of each clip, since nobody listened):

| Cue text | `say` reads it as | Sent instead |
|---|---|---|
| `fff`, `sss`, `chchch` | letter names: "effe effe effe" (~0.9 s, vowel/fricative alternation) | `ffffffeu`, `sssssseu`, `chchchchchcheu` (one long fricative, then a schwa) |
| `lll`, `mmm`, `vvv`, `zzz`, `jjj`… | letter names or ambiguous | `lllllleu`, … |
| `fffusée`, `lllapin` | ~ the plain word | `ffffffusée` (a slightly longer onset) |
| `aaa`, `eee`, `ééé`… | one vowel, a bit long | `aaaaaa`, `éééééé` (longer, no schwa after a vowel) |
| `za`, `zi` | abbreviations: "zone artisanale", "zone industrielle" (1.2 s) | `zah`, `zih` |
| `beu`, `peu`, `keu` | a syllable (fine) | unchanged |

### Clips to re-record (human listening check)

The spec wants stretched sounds as real recordings. **263 clips** have not been listened to yet: 186 recorded from
adapted TTS input (the stretched sounds above, `ui.sound-final.*` included), 21 plain-TTS "le son beu / teu / gueu…"
clips, and 56 more flagged during the build (syllables spelled for the voice such as `syl.requin.1` "reu" or
`syl.chameau.2` "meau", the capital prompts, the next-dot colour cues, the practice cues). The full key list and the
manual re-recording procedure are in the [README](../README.md#clips-to-check-by-ear). In short: save the mp3 at the
same path (mono, 32 kbps is enough) and set its `sources.json` entry to `{ "manual": true, "text": "<the cue text it
says>" }`, so a re-run never overwrites it (only `--only <key> --force` does).

Most at risk (voiced continuants, where the measurement cannot tell a stretch from a spelled letter):
`j`, `z`, `v`, `l`, `m`, `n`, `r`; and `ui.sound-final.eacute` (6.5 s).

## `node tools/trace-sheet.mjs` — render trace models before they ship

Dev aid, no dependencies. Draws each trace model as an SVG through `assets/gs/trace-geom.js`, so the render shows
exactly what the canvas draws: lignage, grey corridors, arrows, numbered start dots.

```
node tools/trace-sheet.mjs [--deck letters|numbers|caps|all] [--only a,b] [--points] [--state k] [--out DIR]
qlmanage -t -s 400 -o DIR DIR/caps-e.svg     # macOS: SVG → PNG to look at
```

| Option | Default | |
|---|---|---|
| `--deck` | `all` | `letters` (cursive `trace`), `numbers` (digits), `caps` (`capTrace`), or all three |
| `--only a,b` | | only these item ids; without it, a contact sheet `sheet-<deck>.svg` is written too |
| `--points` | | number every waypoint, one colour per stroke |
| `--state k` | `0` | draw the start dots as they look once k strokes are done (a hidden coincident dot appears) |
| `--out DIR` | `$TMPDIR/trace-sheet` | output folder; never commit it |

Files are `<deck>-<id>.svg`. The check loop per glyph, and the model conventions, are in the
[README](../README.md#add-or-change-a-trace-model-capital-cursive-letter-digit).
