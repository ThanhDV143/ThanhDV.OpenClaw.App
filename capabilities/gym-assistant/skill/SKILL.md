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

Use:

- `gym_log_latest` for "lần gần nhất".
- `gym_log_search` for history or comparison requests.

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
