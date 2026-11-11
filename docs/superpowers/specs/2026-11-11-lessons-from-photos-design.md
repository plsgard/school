# Lessons from photos — design spec

Date: 2026-11-11 · Status: for the parent's approval · First lesson: Louis, English, "What day is it?" (days, months, dates)

## 1. Intent

The kids learn their lessons on the school material (notebook, handouts). The app is where they **test** what they
learnt. The parent sends photos of a lesson to Claude; Claude turns them into a lesson file; the lesson shows up in the
child's track with exercises that adapt to how he does.

Why: the existing tracks cover a fixed programme. The recurring need is punctual — "there is a test on this page next
week" — and nobody has time to author exercises by hand.

What "adapts" means (parent's words): start with what he is good at, for reward and motivation, then move the path
towards the harder parts; when one exercise format does not make him progress, try another.

## 2. Goals, non-goals, anti-goals

Goals
- G1. Photos → a playable lesson with **no code change per lesson**: one lesson file, validated by tests.
- G2. Works from a Claude Code session on the laptop or from the Claude app on the iPad/iPhone (cloud session on the repo).
- G3. Written production is practised: the test is written, and the English track has no typing exercise today.
- G4. Each item follows a ladder from recognising to writing from memory; known items climb fast, weak ones get more
  support and a different format when stuck.
- G5. A session opens and closes on a success.
- G6. The parent can see where he stands on a lesson, and can hand Claude a progress summary to steer the next lesson.

Non-goals (this iteration)
- An upload button in the app / calling an LLM from the browser. The lesson file format is the seam for it later.
- Subjects other than English, kids other than Louis. Formats are kept subject-neutral where it costs nothing.
- Fixing speech recognition. The new exercises never need the microphone. (It is still reported broken on the iPad;
  separate work.)
- A timed mock test with deferred feedback. Later, once the ladder is proven.
- Changing the existing decks' behaviour or card ids (progress on the iPad is keyed by them).

Anti-goals
- Exercises generated from the child's handwriting mistakes. The notebook photographed on 2026-11-11 has "Tuestay",
  "Tursday", "birday", "3nd". The lesson file holds the **correct** language; his slips are used only as distractors and
  as hints of where to insist.
- Anything that needs a build step, a framework, a backend, an account or a key. Static files, push to deploy.
- Photos in the repo. They show a child's notebook; only the derived lesson file is committed.
- A child blocked on an item. Every exercise ends with the answer and moves on.

## 3. The loop

1. The parent sends photos (and, if known, the test date) in a Claude session and says which child.
2. Claude reads them and replies with: what the lesson contains, the mistakes it saw in the notebook (for the parent,
   not for the app), and the lesson it proposes (groups, item counts).
3. Claude writes the lesson file, runs the tests, pushes to `main`. The parent's request is the go-ahead to push;
   anything else touched in the same session still follows the repo's normal rules.
4. The lesson appears on the child's home screen at the next page load.
5. Later, the parent can paste the progress summary (§8) into a session; Claude adjusts the lesson file (more items on
   weak spots, new distractors) and pushes again. Item ids are stable so progress survives.

The procedure lives in the repo (README section + a pointer in CLAUDE.md) so a fresh session, including a cloud one
started from the iPad, follows it without this conversation. It must state: HEIC conversion on the laptop
(`sips`), photos go to the git-ignored `inbox/` or a scratch folder, never `git add`ed.

## 4. Lesson file

One JSON file per lesson under the English track's deck folder, listed in the deck index like today's decks. A lesson
holds several **groups**; each group is what a deck is today (`kind` + `items`). Existing single-deck files stay valid
and unchanged.

Lesson fields: `id`, `label` (shown to the child, French), `source` (what was photographed, for the parent), optional
`exam` (ISO date of the test), `groups`.

Two new group kinds, both written production:

- `spell` — one word or short form. Example: cue "mercredi" → `Wednesday`; cue "12th" → `the twelfth`; cue "3" → `3rd`.
- `write` — a phrase or sentence. Example: cue "Mercredi 12 avril" → `Wednesday, April 12th`.

Item fields for both: `id`; `cue` (text shown: French or a symbol/number); `en` (accepted answers, model first, as
today); optional `slips` (plausible wrong forms, written by Claude: look-alikes and the child's real mistakes — used as
distractors, never accepted); optional `strict` flags `case` and `punct` (default: both on for `write`, `case` on for
`spell`), because this lesson's rule *is* the capital letter and the comma; optional `hear` (text spoken by the device
voice when it differs from what is written: "Wednesday, April the twelfth" for `Wednesday, April 12th`).

One dynamic item is allowed: `"dynamic": "today"` — cue "What day is it today?", answer computed from the device date
in the lesson's written form (`Today is Wednesday, November 11th.` and the bare date both accepted).

Existing kinds (`vocab`, `grammar`, `text`) can be groups of a lesson as they are. The dates lesson uses `grammar`
(gap-pick) for its sentences.

Card ids stay `deckId/itemId#skill`; a lesson group's deck id is `<lessonId>-<groupId>`. The new kinds have **one card
per item** (skill `write`): the ladder below changes the exercise format, not the card.

Validation, as a test over every lesson file: required fields, unique ids, `en[0]` not in `slips`, no slip equal to an
accepted answer under the item's strictness, at least 3 usable distractors for level 1 (own `slips` completed by other
items of the group), `exam` a valid date.

## 5. The ladder (one card, four levels)

| Level | What he does | Formats |
|---|---|---|
| 1 Recognise | sees the cue, picks the right written form among 4 | pick |
| 2 Complete | rebuilds it with help | missing letters (the hard spots are blanked) · letter/word tiles to order |
| 3 Write | types it from the cue | type · look–cover–write (shown 3 s, hidden, typed) |
| 4 Transfer | types it from audio only (dictation with the device voice) | hear-and-write |

- `spell` items go 1 → 2 → 3. `write` items go 2 (word tiles) → 3 → 4 (level 4 only when the device has an English
  voice; otherwise 3 is their top); they start once the words they are made of have been met.
- A new item starts at level 1 (`spell`) or 2 (`write`).

Two phases per card:

- **Learning** (below a first success at the top level). No Leitner box: the card is available every day and climbs
  **inside a session**. It may be played up to three times in one session, never twice in a row, with at least three
  other exercises in between when the session has them.
- **Review** (from the first right-first-try at the top level). That answer creates the Leitner state; from then on
  the card is scheduled and recorded exactly as today's cards (box up on right first try, down on anything else), always
  in its top-level format. **Mastered** = right first try at the top level on two different days.

Transitions while learning (every answer is scored, including same-session comebacks):

- **Right first try**: up one level. Right first try **and** under a time threshold (builder's tunable, per level):
  skip one level. So a word he already knows goes pick → type within one session and is mastered on the next day's
  success.
- **"Presque" then right on the second try** (§6): stays at its level. No climb, no drop, not listed as a miss.
- **Miss** (wrong, or still wrong after the "presque" retry): the answer is shown with the differing part highlighted;
  for typed levels he retypes it correctly once (copy, not scored). First miss at a level: the card stays at that level
  and comes back later in the session in the level's **other format** (level 1 has one format: it comes back with 2
  choices instead of 4). Second miss in a row at that level: down one level (floor: the item's starting level).
- A miss in the review phase is a normal Leitner wrong, and the card goes back to learning one level below the top.
- **Which format first**: the app keeps, per child, how often each format was followed by a right answer on that
  item's next exercise. At a level with two formats it starts with the one that has worked better for him (ties and
  samples under ~8: the table's order). This is the "his way of learning" rule — small, transparent, testable.

The level, phase, last formats used and last wrong answer typed are stored with the card's state, through
`assets/storage.js`. The shared scheduler rebuilds a card's state from four fields today; how the extra fields are kept
(wrapper on the English side or a pass-through in core) is the builder's call, provided GS and CE2 behaviour and tests
are untouched.

## 6. Checking a typed answer

Outcomes, in order: exact → right. Differs only by case or punctuation on a strict item → "presque" with the precise
reason ("Il manque la majuscule", "Il manque la virgule"), one more try, not counted as right first try. One or two
letters off → "presque", one more try, same. Otherwise wrong. Leading/trailing spaces and double spaces never matter;
the curly apostrophe equals the straight one.

The text field must disable autocorrect, autocapitalise and spell-check, or iOS writes the answer for him. Enter
submits. UI copy is French, as in the rest of the track; non-colour cues (✅ ❌) are kept.

## 7. Session

- Home lists lessons (a lesson = one card with its groups' progress and, when `exam` is set and not past, "Contrôle dans
  N jours"). A lesson has its own ▶ "Réviser cette leçon": a **lesson session**, restricted to that lesson, with its
  own composer. As many a day as he wants.
- The **existing daily session is not changed**: same `nextCard`, same order. It only gains the new kinds' cards that
  are in the review phase (Leitner, top-level format). Learning happens in lesson sessions.
- Lesson session order. Opener (first two exercises) and closer (last one): items he got right before, replayed at the
  level he passed and **not recorded** (pure reward; like a GS not-due practice card). When there is no history yet,
  the session opens with level-1 picks of the first group. In between, by priority:
  1. comebacks owed from this session (misses, climbs);
  2. learning cards already seen, weakest level first;
  3. new items in teaching order (groups in file order), within the new-item budget;
  4. review cards that are due.
  Once at least one `write` item is available (the words it is made of have each been met once, not necessarily
  mastered), about a third of the middle slots go to the `write` group: the test looks like that group.
- New-item budget for a lesson session: builder's tunable, generous (the test is days away); no daily cap for the new
  kinds while `exam` is within 7 days.
- Lesson session length: the parent's existing "cartes par séance" setting counts **exercises** (a card replayed counts
  again). "Again" is unlimited, as today.

## 8. Parent corner

Per lesson: items per level, mastered count, and the list "à surveiller" with what he last typed (e.g. `Thursday` ← "Tursday").
A "Copier le bilan" button puts a plain-text summary of the same on the clipboard, to paste into a Claude session.
No new settings beyond what exists.

## 9. First lesson: "What day is it?" (content outline)

From the photos of 2026-11-11. The photos are not in the repo: Claude writes this lesson file in the session that has
them. About 65 items, sized so that a child who knows half of it gets through in 5–6 lesson sessions.

Accepted written form for a date: **only** the lesson's, `Wednesday, April 12th` (capitals, comma, ordinal in digits
with its suffix). `April 12`, `12th April`, `the 12th of April` are not accepted: the handout teaches one form.

- `days` (spell, 7): lundi → Monday … Slips include Tuestay, Tursday, Wensday, Saterday.
- `months` (spell, 12): janvier → January … Slips include Febuary, Agust, lowercase forms.
- `ordinals` (spell, ~16): "1st" → `the first`. The irregular ones (first, second, third, fifth, eighth, ninth, twelfth,
  twentieth, twenty-first, twenty-second, twenty-third, thirtieth, thirty-first) plus three regular ones as a pattern
  (fourth, eleventh, thirteenth). Not all 31.
- `suffix` (spell, 8): "1" → `1st`, "2" → `2nd`, "3" → `3rd`, "11" → `11th`, "12", "13", "21", "22". Slips: the other suffixes.
- `dates` (write, ~15): "Mercredi 12 avril" → `Wednesday, April 12th`, with `hear` "Wednesday, April the twelfth".
  Covers every day and month at least once and the irregular ordinals; includes the notebook's three
  (`Wednesday, April 12th` · `Sunday, July 21st` · `Thursday, February 3rd`).
- `sentences` (grammar gap-pick + two `write` items): What day is it today? · Today is … · There are 7 days in a week. ·
  There are 12 months in a year. · When is your birthday? · My birthday is **on** June 10th. Plus the dynamic "today" item.

The rule box ("on écrit … mais on dit …") is not an exercise by itself; levels 3–4 of `dates` practise it.

## 10. Constraints

- Static, no build, no dependency; Bootstrap from CDN as is. Storage only through `assets/storage.js`.
- `main` is production: tests green and a manual pass in a browser at iPad width before pushing code.
- Tests: `node --test`, existing naming (`Method_Condition_Expectation`), pure logic (ladder, answer checking, session
  order, validation) separated from DOM so it is testable, as in the current track.
- Docs to sync in the same change: ARCHITECTURE.md (lesson format, ladder, mermaid of the loop and of the level
  transitions), README (photos → lesson procedure), CLAUDE.md (it still says "no tests"; add the procedure pointer).

## 11. Left to the builder

File and module names, loader mechanics, thresholds and budgets, exact French copy, tile/blank selection heuristics
(blank the letters where `slips` differ from the answer first), CSS, and how the extra card fields are stored.

## 12. Calls made by Claude (not decided by the parent)

- English track and Louis only for now; other subjects later.
- One card per item with levels, rather than one card per exercise type.
- No microphone in the new exercises.
- French cues for this lesson (the notebook exercise itself goes French → English), although earlier decks avoid French.
- Push to `main` without a separate confirmation when the parent asked for the lesson.
- No timed mock test in this iteration.
- Learning happens in "Réviser cette leçon" sessions; the daily session is untouched and only reviews what is learnt.
- A card climbs its levels inside one session; spaced repetition starts once he can write the item from memory.
- A missing capital or comma is "presque" with one retry, and does not send him back a level.
- The first lesson has 16 ordinals, not 31, and accepts only the handout's date form.
- Opening and closing exercises are replays of past successes and are not recorded.

- While the test is within 7 days, a card he can write but has not yet mastered comes back every day in the lesson
  session (not only when its Leitner box says so).

## 13. Answered by the parent

- Design approved 2026-11-11. The test is Friday 2026-11-13 (`exam`).
