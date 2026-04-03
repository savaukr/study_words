# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WordWise — Слова тижня** is a self-contained, single-file Ukrainian-language English vocabulary learning app. There is exactly one file: `weekly-words-standalone (1).html`. No build system, no package manager, no dependencies — open in a browser directly.

## Running the App

Open `weekly-words-standalone (1).html` in a browser (Chrome or Edge recommended for voice features). No server required.

## Architecture

Everything lives in one HTML file in three sections:
1. **CSS** (lines ~8–278): CSS custom properties (`--ink`, `--paper`, `--gold`, etc.) define the visual theme. All layout is plain CSS — no framework.
2. **HTML** (lines ~280–414): Four tab views (`#view-week`, `#view-words`, `#view-archive`, `#view-quiz`) are rendered into placeholder `<div>` containers via innerHTML.
3. **JavaScript** (lines ~415–3151): All logic is vanilla JS with no external libraries.

### Word Database

`WORDS` is a flat array of `[english, part_of_speech, ukrainian_translation]` tuples (~1865 entries). Parts of speech: `noun`, `verb`, `adj`, `adv`, `phrase`. This is the sole data source — there is no external API for words.

### Storage Architecture

Two persistence layers:
- **localStorage** (`ww_week_data`): Current and recent week data only. Key is `YYYY-MM-DD` (Monday of the week). Value: `{ words: string[] }` — array of English words. `ww_week_limit` stores the configurable words-per-week setting.
- **IndexedDB** (`wordwise_db` v1): Two object stores:
  - `weeks` (keyPath: `weekKey`): Archived week records with `{ weekKey, label, words, archived, bestScore }`.
  - `scores` (keyPath: `id`): Best quiz scores per mode+source combo (e.g., `"en-uk_week"`).

On boot, `migrateOldWeeks()` automatically promotes past weeks from localStorage to IndexedDB.

### Key Rendering Functions

| Function | Purpose |
|---|---|
| `renderWeek()` | Rebuilds entire weekly view (days strip + word slots + add panel) |
| `renderWordList()` | Paginated all-words grid with search/filter |
| `renderArchive()` | Async: reads IDB, renders accordion week list |
| `showSetup()` / `startQuiz()` / `renderQCard()` / `finishQuiz()` | Quiz state machine |

All views render via `innerHTML` string concatenation into container elements — there is no virtual DOM or component framework.

### Quiz Flow

State is held in `qState = { words, idx, correct, answered }` and `qz = { active, mode, src }`.

Three quiz modes:
- `en-uk`: Show English, type Ukrainian
- `uk-en`: Show Ukrainian, type English
- `uk-en-voice`: Show Ukrainian, speak English (uses Web Speech Recognition — Chrome/Edge only)

Answer checking (`checkAns`, `checkVoice`) uses token-based fuzzy matching. On finish, if source is `week` and score ≥ 60%, the week is auto-archived to IDB.

### TTS

`speakWord(word, btn)` first fetches audio from `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`, then falls back to the Web Speech Synthesis API.

### Week Key Logic

Weeks are keyed by the ISO date of the Monday (`getWeekKey(date)`). `ensureWeek()` initializes a new random week on first visit of a new week.
