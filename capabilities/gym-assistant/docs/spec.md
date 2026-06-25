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

### `gym_log_append`

Append one exercise row to the current workout date. Writes preserve the existing sheet shape and do not require an `Exercise ID` column.

## Runtime Config

```json
{
  "spreadsheetId": "google-sheet-id",
  "sheetName": "Gym",
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

For write requests:

- If the user gives no date, default to today in the OpenClaw server timezone.
- If the user gives only one set, call `gym_log_append`.
- Confirm the exact row written after the tool succeeds.

## Test Cases

- Blank date cells inherit the previous date.
- Decimal weights like `12,5` parse as `12.5`.
- Exact normalized exercise names still work.
- Confirmed aliases search all raw names in that cluster.
- Unknown aliases return `resolutionRequired` instead of guessed data.
- Appending the first exercise of a new date writes the date cell.
- Appending another exercise on the same date leaves the date cell blank.

