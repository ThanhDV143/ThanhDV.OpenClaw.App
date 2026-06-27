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

## Plan Requests

For questions like:

- "Hôm nay tôi tập gì?"
- "Buổi lower gần nhất là hôm nào?"
- "Buổi upper trước tôi có kéo xà không?"

Use `gym_plan_status`.

The Plan sheet describes how to choose the next workout and lists the planned exercises for each workout column. The plugin classifies recent workout days by comparing performed exercises against Plan sessions.

When answering:

- For "hôm nay tôi tập gì", use `nextSession` and mention the plan description when useful.
- For "lower gần nhất" or "upper gần nhất", inspect `recentSessions` and match against `session.name`.
- For "buổi upper trước có bài X không", inspect the newest matching `recentSessions` entry and compare both `performedExercises` and planned `session.exercises`.
- If classification confidence is weak, mention the matched exercises used as evidence instead of overstating certainty.

## Analytics Requests

For questions like:

- "Vẽ biểu đồ tiến độ Pull-ups 3 tháng gần đây"
- "Tôi tập đều không?"
- "Thống kê volume theo tuần"

Use:

- `gym_progress_report` for progress, volume, best set, reps, weight, or trend questions. Pass `exercise` when the user asks about one exercise.
- `gym_consistency_report` for workout frequency, streaks, session count, and consistency questions.

When answering:

- Use the returned `summary`, `series`, `insights`, and `notices`.
- Prefer `chartText` for chart output because it is plain text and works across chat channels.
- Mention the period/range used if the user did not specify them.
- Do not recalculate metrics manually from raw rows in chat.

## Write Requests

For messages like:

- "Pull-ups set 1 10 rep"
- "Dumbbell Bench Press set 1 10 rep 25kg"

Use:

- `gym_log_append` when adding a new exercise row. The tool keeps sheet rows in date order: existing dates go at the end of that date's block, dates between existing days go before the next later day, and only dates after the latest day go at the end of the sheet.
- `gym_log_find` before editing or deleting any existing row.
- `gym_log_update` only after the user confirms the exact row from `gym_log_find`.
- `gym_log_delete` only after the user confirms the exact row from `gym_log_find`.

If the user does not give a date, default to today's date in the OpenClaw server timezone. Confirm exactly what was written and where it was placed after the tool succeeds.

For edit/delete requests:

- First call `gym_log_find` with the exercise/date clues from the user.
- Show the likely row(s) with date, exercise, sets, rest, note, and row number.
- Ask one short confirmation question before changing data, then wait for the user's next reply.
- After the user confirms, call `gym_log_update` or `gym_log_delete` with the exact `rowNumber`, `expectedFingerprint`, `confirmed: true`, and `userConfirmation` copied from that reply.
- If the update/delete tool says the row changed after confirmation, stop and call `gym_log_find` again.

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
{ "recentLimit": 10 }
```

```json
{ "exercise": "Pull-ups", "period": "week", "range": "3m", "chartMetric": "totalReps" }
```

```json
{ "period": "week", "range": "6m", "chartMetric": "sessionCount" }
```

```json
{
  "exercise": "Dumbbell Bench Press",
  "sets": [{ "set": 1, "reps": 10, "weightKg": 25 }],
  "restSeconds": 120,
  "note": ""
}
```

```json
{ "exercise": "Pull-ups", "date": "2026-06-27", "limit": 3 }
```

```json
{
  "rowNumber": 12,
  "expectedFingerprint": "abc123",
  "confirmed": true,
  "userConfirmation": "Đúng, sửa dòng 12",
  "sets": [{ "set": 2, "reps": 8, "weightKg": null }]
}
```

```json
{ "rowNumber": 12, "expectedFingerprint": "abc123", "confirmed": true, "userConfirmation": "Đúng, xóa dòng 12" }
```

## Safety

- Do not guess missing exercise names.
- Do not silently fix suspicious sheet data.
- Do not call update/delete before the user confirms a `gym_log_find` candidate.
- Do not expose Google credentials or spreadsheet IDs in chat.
