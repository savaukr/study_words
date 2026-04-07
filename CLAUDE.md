# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WordWise — Слова тижня** is a Ukrainian-language vocabulary learning app supporting English and German. It consists of `index.html`, `style.css`, `app.js`, and JSON word databases. No build system, no package manager, no external dependencies — serve with any static server or open directly in a browser.

## Running the App

```
npx serve .
```
Or open `index.html` directly in Chrome/Edge (Chrome/Edge required for voice features).

## Architecture

The app is split into three files:
1. **`style.css`** — CSS custom properties (`--ink`, `--paper`, `--gold`, etc.) define the visual theme. All layout is plain CSS — no framework.
2. **`index.html`** — Five tab views (`#view-week`, `#view-words`, `#view-archive`, `#view-quiz`, `#view-verbs`) rendered into placeholder `<div>` containers.
3. **`app.js`** — All logic is vanilla JS with no external libraries.

## Word Databases

Words are stored in JSON files as flat arrays of `[word, part_of_speech, ukrainian_translation]` tuples. Parts of speech: `noun`, `verb`, `adj`, `adv`, `phrase`.

| File | Language | Level | Approx. entries |
|------|----------|-------|-----------------|
| `words-a1-a2.json` | English | A1–A2 | ~500 |
| `words-b1-b2.json` | English | B1–B2 | ~800 |
| `words-c1-c2.json` | English | C1–C2 | ~500 |
| `de-words-a1-a2.json` | German | A1–A2 | ~1500 |
| `de-words-b1-b2.json` | German | B1–B2 | — |
| `de-words-c1-c2.json` | German | C1–C2 | — |

Active file is resolved by `wordsJsonFile()` using `WORD_LANG` + `WORD_LEVEL`:
```js
const prefix = WORD_LANG === 'en' ? '' : WORD_LANG + '-';
return prefix + 'words-' + WORD_LEVEL + '.json';
```

`WORDS` holds the currently loaded array in memory.

## Settings & Language Switching

Three user-configurable settings (persisted in `localStorage`):
- `ww_week_limit` — number of words per week (default: 5)
- `ww_word_level` — CEFR level: `a1-a2`, `b1-b2`, `c1-c2` (default: `b1-b2`)
- `ww_word_lang` — language: `en` or `de` (default: `en`)

`changeLang(lang)` handles language switching:
1. Updates `WORD_LANG`, `localStorage`, lang button active states.
2. Hides/shows the "Дієслова" tab (`#verbsTab`): hidden for `de`, visible for `en`.
3. If switching to `de` while on the Verbs tab, redirects to the Week tab.
4. Fetches the new word JSON file into `WORDS`.
5. Re-renders whichever tab is currently active (`week`, `words`, `archive`, or `quiz`).

**"Дієслова" tab is English-only** — it is hidden when `WORD_LANG === 'de'` both on init and on language switch.

## Storage Architecture

Two persistence layers:
- **localStorage** (`ww_week_data`): Current and recent week data only. Key is `YYYY-MM-DD` (Monday of the week). Value: `{ words: string[] }` — array of words. `ww_week_limit` stores the configurable words-per-week setting.
- **IndexedDB** (`wordwise_db` v1): Two object stores:
  - `weeks` (keyPath: `weekKey`): Archived week records with `{ weekKey, label, words, archived, bestScore }`.
  - `scores` (keyPath: `id`): Best quiz scores per mode+source combo (e.g., `"en-uk_week"`).

On boot, `migrateOldWeeks()` automatically promotes past weeks from localStorage to IndexedDB.

## Key Rendering Functions

| Function | Purpose |
|---|---|
| `renderWeek()` | Rebuilds entire weekly view (days strip + word slots + add panel) |
| `renderWordList()` | Paginated all-words grid with search/filter |
| `renderArchive()` | Async: reads IDB, renders accordion week list |
| `showSetup()` / `startQuiz()` / `renderQCard()` / `finishQuiz()` | Quiz state machine |
| `renderIrregVerbs()` | Renders irregular English verbs table (English only) |

All views render via `innerHTML` string concatenation into container elements — there is no virtual DOM or component framework.

## Tab Switching

`switchTab(tab)` activates a view by toggling `.active` on tab buttons and `#view-*` divs. On switch it calls the appropriate render function. Language change also triggers a re-render of the currently active tab.

## Quiz Flow

State is held in `qState = { words, idx, correct, answered }` and `qz = { active, mode, src }`.

Three quiz modes:
- `en-uk`: Show word, type Ukrainian
- `uk-en`: Show Ukrainian, type the word
- `uk-en-voice`: Show Ukrainian, speak the word (uses Web Speech Recognition — Chrome/Edge only)

Answer checking (`checkAns`, `checkVoice`) uses token-based fuzzy matching. On finish, if source is `week` and score ≥ 60%, the week is auto-archived to IDB.

## TTS

`speakWord(word, btn)` first fetches audio from `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`, then falls back to the Web Speech Synthesis API.

## Week Key Logic

Weeks are keyed by the ISO date of the Monday (`getWeekKey(date)`). `ensureWeek()` initializes a new random week on first visit of a new week.
