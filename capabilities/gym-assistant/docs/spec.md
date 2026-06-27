# Gym Assistant for OpenClaw

## Goal

Allow OpenClaw chat channels to query and update a Google Sheet workout journal without forcing the user to keep sheet data machine-perfect.

The Google Sheet remains the human-facing source of truth. Exercise alias memory lives outside the sheet and is managed by the plugin.

## Assumptions

- The sheet layout follows the attached CSV:
  - Row 1: `Ngày`, `Bài tập`, grouped columns `Set 1` to `Set 4`, `Thời gian nghỉ (s)`, `Ghi chú`
  - Row 2: per-set subheaders `Rep`, `Tạ`
  - Blank date cells inherit the most recent date above.
- Vietnamese decimal values may use comma notation, for example `12,5`.
- The user may freely edit exercise names in the sheet.
- Known aliases are stored in plugin memory, not in the workout sheet.
- Unknown aliases return a resolution prompt instead of a guessed result.

## Tools

### `gym_log_latest`

Return the newest workout entry for a resolved exercise alias cluster.

Input:

```json
{ "exercise": "kéo xà", "date": "2026-06-25" }
```

If resolved:

```json
{
  "resolution": {
    "status": "resolved",
    "cluster": {
      "canonicalName": "Pull-ups",
      "aliases": ["Pull-ups", "kéo xà"]
    }
  },
  "entry": {
    "date": "2026-06-25",
    "exercise": "Pull-ups",
    "sets": [{ "set": 1, "reps": 10, "weightKg": null }]
  }
}
```

If unresolved:

```json
{
  "resolution": {
    "status": "resolutionRequired",
    "candidates": [{ "exercise": "Pull-ups", "lastDate": "2026-06-25", "count": 8 }]
  },
  "entry": null
}
```

### `gym_log_search`

Return recent entries for a resolved exercise alias cluster. Unknown aliases return `resolutionRequired` and no matches.

### `gym_alias_add`

Persist a user-confirmed alias outside the workout sheet.

Input:

```json
{ "canonicalName": "Pull-ups", "alias": "kéo xà" }
```

### `gym_alias_list`

List the current alias memory.

### `gym_progress_report`

Calculate progress metrics from the workout sheet and return JSON plus chat-compatible `chartText`.

Input:

```json
{ "exercise": "Pull-ups", "period": "week", "range": "3m", "chartMetric": "totalReps" }
```

Output includes:

- `summary`: total sessions, entries, sets, reps, best set, max weight, estimated weighted volume.
- `series`: period buckets with metrics.
- `chartSpec`: simple bar chart metadata for future UI renderers.
- `chartText`: plain text bar chart for chat channels.
- `insights` and `notices`.

### `gym_consistency_report`

Calculate workout frequency and streak metrics from the workout sheet.

Input:

```json
{ "period": "week", "range": "6m", "chartMetric": "sessionCount" }
```

Output includes:

- `summary`: workout days, current/longest streak, average workout days per week, last workout date.
- `series`: period buckets with session count, entries, sets, and reps.
- `chartSpec`, `chartText`, `insights`, and `notices`.

### `gym_log_append`

Add one exercise row to a workout date while preserving date order. If the date already exists, the tool inserts the row at the end of that date's block before the next date. If the date is new but falls between existing days, it inserts the row before the next later date. Only dates after the latest existing day append to the sheet. Writes preserve the existing sheet shape and do not require an `Exercise ID` column.

### `gym_log_find`

Find candidate workout rows before editing or deleting. Returns parsed entries plus a row fingerprint.

Input:

```json
{ "exercise": "Pull-ups", "date": "2026-06-27", "limit": 3 }
```

Output:

```json
{
  "matches": [
    {
      "entry": { "rowNumber": 12, "date": "2026-06-27", "exercise": "Pull-ups" },
      "fingerprint": "abc123"
    }
  ]
}
```

### `gym_log_update`

Update a confirmed workout row. The tool rereads the sheet and refuses to write if the row fingerprint no longer matches.

Input:

```json
{
  "rowNumber": 12,
  "expectedFingerprint": "abc123",
  "confirmed": true,
  "userConfirmation": "Đúng, sửa dòng 12",
  "sets": [{ "set": 2, "reps": 8, "weightKg": null }]
}
```

### `gym_log_delete`

Delete a confirmed workout row. If the deleted row is the first row for a date, the tool writes that date to the next blank-date row before deleting so date inheritance stays valid.

Input:

```json
{ "rowNumber": 12, "expectedFingerprint": "abc123", "confirmed": true, "userConfirmation": "Đúng, xóa dòng 12" }
```

### `gym_plan_status`

Read the `Plan` sheet, classify recent workout days against the planned session columns, and return the next planned session.

Input:

```json
{ "today": "2026-06-27", "recentLimit": 10 }
```

Output:

```json
{
  "today": "2026-06-27",
  "plan": {
    "description": "Lịch tập có 4 buổi đan xen...",
    "sessions": [
      { "index": 0, "name": "Lower & Core", "exercises": ["Barbell Squat"] }
    ]
  },
  "lastCompletedSession": {
    "date": "2026-06-25",
    "session": { "name": "Upper" },
    "matchedExercises": ["Dumbbell Bench Press"]
  },
  "nextSession": { "name": "Lower & Core" },
  "recentSessions": []
}
```

## Runtime Config

```json
{
  "spreadsheetId": "google-sheet-id",
  "sheetName": "Gym",
  "planSheetName": "Plan",
  "credentialsPath": "/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json",
  "defaultRestSeconds": 120,
  "aliasStorePath": "/home/node/.openclaw/gym-assistant/exercise-aliases.json"
}
```

Environment fallbacks:

- `GYM_GOOGLE_SPREADSHEET_ID`
- `GYM_GOOGLE_SHEET_NAME`
- `GYM_GOOGLE_APPLICATION_CREDENTIALS`
- `GYM_DEFAULT_REST_SECONDS`
- `GYM_EXERCISE_ALIAS_PATH`

## Agent Behavior

For read questions:

- Call `gym_log_latest` or `gym_log_search`.
- If `resolution.status` is `resolved`, answer from returned entries.
- If `resolution.status` is `resolutionRequired`, ask one short confirmation question using top candidates.
- After the user confirms two names are the same exercise, call `gym_alias_add`.
- Do not silently choose fuzzy candidates as fact.

For plan questions:

- Call `gym_plan_status`.
- Use `nextSession` for "hôm nay tôi tập gì".
- Use `recentSessions` to answer questions about the latest lower/upper session or whether a previous session included an exercise.
- Mention matched exercises if the classification may be weak.

For analytics questions:

- Call `gym_progress_report` for exercise progress, volume, best set, reps, weight, or trend questions.
- Call `gym_consistency_report` for frequency, streak, and consistency questions.
- Use `chartText` when the user asks for a chart, because it is plain text and portable across chat channels.
- Use `notices` to explain bodyweight or missing-weight limitations.

For write requests:

- If the user gives no date, default to today in the OpenClaw server timezone.
- If the user gives only one set, call `gym_log_append`.
- Confirm the exact row written after the tool succeeds.

For edit/delete requests:

- Call `gym_log_find` first and ask the user to confirm the exact row.
- Call `gym_log_update` or `gym_log_delete` only with the confirmed row number, fingerprint, and confirmation text copied from the user's reply.
- If the fingerprint check fails, ask the user to re-confirm from fresh candidates.

## Test Cases

- Blank date cells inherit the previous date.
- Decimal weights like `12,5` parse as `12.5`.
- Exact normalized exercise names still work.
- Confirmed aliases search all raw names in that cluster.
- Unknown aliases return `resolutionRequired` instead of guessed data.
- The Plan sheet parses duplicate session names as separate slots.
- Plan status returns the next session after the most recent classified workout day.
- Progress report groups metrics by day/week/month/year/all and returns chart text.
- Consistency report returns workout frequency and streak metrics with chart text.
- Appending the first exercise of a new date writes the date cell.
- Appending another exercise on the same date leaves the date cell blank.
- Adding an exercise to an older existing date inserts it inside that date block before the next date.
- Adding an exercise to a missing date between two logged days inserts it before the next later day.
- Updating a row requires a matching fingerprint.
- Deleting the first row for a date preserves date inheritance for the next row.
