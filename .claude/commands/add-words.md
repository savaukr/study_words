# Add Words by CEFR Level

Add new English words to `words.json` for a given proficiency level.

## Usage
```
/add-words <level> [count]
```

**level** — A1, A2, B1, B2, C1, or C2  
**count** — how many words to add (default: 20)

---

The arguments are: $ARGUMENTS

Parse them: first token is `level`, second (optional) is `count` (default 20).

## Steps

### 1. Read existing words

Read `words.json`. It is a JSON array of tuples `["english", "part_of_speech", "ukrainian"]`.

Collect all English words (index 0) into a Set to avoid duplicates.

Allowed parts of speech: `noun`, `verb`, `adj`, `adv`, `phrase`.

### 2. CEFR level guide

Generate words that are genuinely representative of the requested level:

| Level | Description |
|-------|-------------|
| A1 | Survival basics — numbers, colors, family, body, food, simple verbs (go, eat, have, be) |
| A2 | Everyday topics — shopping, travel, time, weather, simple adjectives, common phrases |
| B1 | Current level in the file — work, society, opinions, abstract ideas, intermediate vocabulary |
| B2 | Nuanced, formal/informal register, complex reasoning, professional contexts |
| C1 | Advanced, precise, academic and professional vocabulary, low-frequency but important words |
| C2 | Mastery — rare, literary, highly idiomatic, sophisticated nuance |

### 3. Generate `count` new words

Produce exactly `count` words **not already in the existing set**.

For each word provide:
- `english` — word or short phrase
- `part_of_speech` — noun / verb / adj / adv / phrase
- `ukrainian` — accurate translation, 2–3 variants separated by `, ` where natural

### 4. Append to `words.json`

Use the Edit tool to replace the final `]` of the file with the new entries followed by `]`.

Format each new entry as a JSON array on its own line, comma-separated, consistent with existing style.

### 5. Report

Print a markdown table of the added words:

| English | POS | Ukrainian |
|---------|-----|-----------|
| ...     | ... | ...       |

Then print: **"Додано N слів рівня LEVEL. Всього в базі: M слів."**
