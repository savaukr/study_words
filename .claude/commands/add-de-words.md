# Add German Words by CEFR Level

Add new German words to `de-words-a1-a2.json` for a given proficiency level.

## Usage
```
/add-de-words <level> [count]
```

**level** — A1, A2, B1, B2, C1, or C2  
**count** — how many words to add (default: 20)

---

The arguments are: $ARGUMENTS

Parse them: first token is `level`, second (optional) is `count` (default 20).

## Steps

### 1. Read existing words

Read `de-words-a1-a2.json`. It is a JSON array of tuples `["german", "part_of_speech", "ukrainian"]`.

Collect all German words (index 0) into a Set to avoid duplicates.

Allowed parts of speech: `noun`, `verb`, `adj`, `adv`, `phrase`.

### 2. CEFR level guide

Generate German words that are genuinely representative of the requested level:

| Level | Description |
|-------|-------------|
| A1 | Survival basics — numbers, colors, family, body, food, simple verbs (gehen, essen, haben, sein) |
| A2 | Everyday topics — shopping, travel, time, weather, simple adjectives, common phrases |
| B1 | Work, society, opinions, abstract ideas, intermediate vocabulary |
| B2 | Nuanced, formal/informal register, complex reasoning, professional contexts |
| C1 | Advanced, precise, academic and professional vocabulary, low-frequency but important words |
| C2 | Mastery — rare, literary, highly idiomatic, sophisticated nuance |

### 3. Generate `count` new words

Produce exactly `count` words **not already in the existing set**.

For each word provide:
- `german` — German word or short phrase (use correct spelling with umlauts: ä, ö, ü, ß)
- `part_of_speech` — noun / verb / adj / adv / phrase
- `ukrainian` — accurate Ukrainian translation, 2–3 variants separated by `, ` where natural

**Important for German nouns:** include the article in a separate note if helpful, but the word itself should be just the noun (e.g., `"Haus"` not `"das Haus"`).

### 4. Append to `de-words-a1-a2.json`

Write a Node.js script using the Bash tool to:
1. Read the existing JSON file
2. Build a Set of existing words to deduplicate
3. Append only new (non-duplicate) entries
4. Write the updated file back

Format each new entry as a JSON array on its own line, comma-separated, consistent with existing style:
```
  ["Wort", "noun", "слово"],
```

### 5. Report

Print a markdown table of the added words:

| Deutsch | POS | Українська |
|---------|-----|------------|
| ...     | ... | ...        |

Then print: **"Додано N слів рівня LEVEL до de-words-a1-a2.json. Всього в базі: M слів."**
