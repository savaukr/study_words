# Add German Words by CEFR Level

Add new German words to the correct level file.

## Usage
```
/add-de-words <level> [count]
```

**level** — A1, A2, B1, B2, C1, or C2  
**count** — how many words to add (default: 20)

---

The arguments are: $ARGUMENTS

Parse them: first token is `level` (case-insensitive), second (optional) is `count` (default 20).

## Steps

### 1. Resolve target file

Map the level to the correct JSON file:

| Level input | Target file |
|-------------|-------------|
| A1 or A2    | `de-words-a1-a2.json` |
| B1 or B2    | `de-words-b1-b2.json` |
| C1 or C2    | `de-words-c1-c2.json` |

Use this file for all subsequent read/write operations.

### 2. Read existing words

Read the target file. It is a JSON array of tuples `["german", "part_of_speech", "ukrainian"]`.
If the file does not exist or is empty, treat existing words as an empty Set.

Collect all German words (index 0) into a Set to avoid duplicates.

Allowed parts of speech: `noun`, `verb`, `adj`, `adv`, `phrase`.

### 3. CEFR level guide

Generate German words that are genuinely representative of the requested level:

| Level | Description |
|-------|-------------|
| A1 | Survival basics — numbers, colors, family, body, food, simple verbs (gehen, essen, haben, sein) |
| A2 | Everyday topics — shopping, travel, time, weather, simple adjectives, common phrases |
| B1 | Work, society, opinions, abstract ideas, intermediate vocabulary |
| B2 | Nuanced, formal/informal register, complex reasoning, professional contexts |
| C1 | Advanced, precise, academic and professional vocabulary, low-frequency but important words |
| C2 | Mastery — rare, literary, highly idiomatic, sophisticated nuance |

### 4. Generate `count` new words

Produce exactly `count` words **not already in the existing set**.

For each word provide:
- `german` — German word or short phrase (use correct spelling with umlauts: ä, ö, ü, ß)
- `part_of_speech` — noun / verb / adj / adv / phrase
- `ukrainian` — accurate Ukrainian translation, 2–3 variants separated by `, ` where natural

**Important for German nouns:** the word itself should be just the noun without article (e.g., `"Haus"` not `"das Haus"`).

### 5. Append to target file

Write a Node.js script using the Bash tool to:
1. Read the existing JSON file (or start with `[]` if missing/empty)
2. Build a Set of existing words to deduplicate
3. Append only new (non-duplicate) entries
4. Write the updated file back

Format each new entry as a JSON array on its own line, comma-separated, consistent with existing style:
```
  ["Wort", "noun", "слово"],
```

### 6. Report

Print a markdown table of the added words:

| Deutsch | POS | Українська |
|---------|-----|------------|
| ...     | ... | ...        |

Then print: **"Додано N слів рівня LEVEL до [target file]. Всього в базі: M слів."**
