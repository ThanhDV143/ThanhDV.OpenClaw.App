---
name: gym-assistant
description: Query and update the user's Google Sheets workout journal from OpenClaw chat.
---

# Gym Assistant

Use this skill when the user asks about workout history or asks to record a gym set.

## Data Source

The Google Sheet workout journal is the source of truth. Use the gym plugin tools when available.

## Read Requests

For questions like:

- "Lần gần nhất tôi tập Pull-ups được mấy rep?"
- "Hôm trước bài Dumbbell Bench Press tôi tập thế nào?"
- "Lịch sử T-Bar Row gần đây?"

Use `gym_log_latest` or `gym_log_search` for read questions.

The workout sheet is user-edited, so exercise names may drift over time, such as `Pull-ups`, `pullup`, or `kéo xà`. The plugin keeps an alias memory outside the sheet. When an exercise resolves, trust the resolved cluster. When a tool returns `resolutionRequired`, do not answer from the candidate list as if it were fact.

When answering:

- Cite the exact date and raw exercise row names you used.
- Prefer the newest dated evidence when the user asks for "hôm nay" or "lần gần nhất".
- If multiple raw names clearly refer to the same exercise, group them in the answer and say which raw names were grouped.
- If the tool returns `resolutionRequired`, ask the user one short confirmation question using the top candidates.
- After the user confirms an alias, call `gym_alias_add` so the system remembers it.

Answer with the date, exercise, sets, reps, weights, rest time, and notes if present.
If the tool returns `null` or an empty match list, say that no matching workout log entry was found.

## Write Requests

For messages like:

- "Pull-ups set 1 10 rep"
- "Dumbbell Bench Press set 1 10 rep 25kg"

Use:

- `gym_log_append` when adding a new exercise row.

If the user does not give a date, default to today's date in the OpenClaw server timezone. Confirm exactly what was written after the tool succeeds.
Do not edit or delete existing rows in the MVP; ask the user to make corrections manually in the sheet for now.

## Tool Inputs

Use these shapes:

```json
{ "exercise": "Pull-ups" }
```

```json
{ "exercise": "Pull-ups", "limit": 5 }
```

```json
{ "canonicalName": "Pull-ups", "alias": "kéo xà" }
```

```json
{
  "exercise": "Dumbbell Bench Press",
  "sets": [{ "set": 1, "reps": 10, "weightKg": 25 }],
  "restSeconds": 120,
  "note": ""
}
```

## Safety

- Do not guess missing exercise names.
- Do not silently fix suspicious sheet data.
- Do not expose Google credentials or spreadsheet IDs in chat.
