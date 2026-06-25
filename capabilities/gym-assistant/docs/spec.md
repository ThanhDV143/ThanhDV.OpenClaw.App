# Gym Assistant for OpenClaw

## Goal

Allow OpenClaw chat channels to query and update a Google Sheet workout journal.

Examples:

- "Hôm trước bài Pull-ups tôi tập thế nào?"
- "Lần gần nhất tôi tập Dumbbell Bench Press được mấy rep?"
- "Dumbbell Bench Press set 1 10 rep 25kg"

The Google Sheet remains the source of truth.

## Assumptions

- The sheet layout follows the attached CSV:
  - Row 1: `Ngày`, `Bài tập`, grouped columns `Set 1` to `Set 4`, `Thời gian nghỉ (s)`, `Ghi chú`
  - Row 2: per-set subheaders `Rep`, `Tạ`
  - Date is only filled on the first row of each training day; blank date cells inherit the most recent date above.
- Vietnamese decimal values may use comma notation, for example `12,5`.
- Exercise matching should be case-insensitive and trim extra spaces.
- Writes should append or update rows in the existing Google Sheet, not create a separate local file.

## Recommended OpenClaw Shape

Use an OpenClaw tool plugin plus a small skill.

- Tool plugin: handles Google Sheets API calls and structured parsing.
- Skill: tells the agent when to call the gym tools and how to phrase answers.

This is the right split because OpenClaw docs describe tools as typed callable actions for reading/changing external systems, while skills are instruction packs for repeatable workflows.

## Tool Contract

Expose these MVP tools from the plugin:

### `gym_log_search`

Find workout history for an exercise.

Input:

```json
{
  "exercise": "Pull-ups",
  "limit": 5
}
```

Output:

```json
{
  "matches": [
    {
      "date": "2026-06-21",
      "exercise": "Pull-ups",
      "sets": [
        { "set": 1, "reps": 9, "weightKg": null },
        { "set": 2, "reps": 8, "weightKg": null },
        { "set": 3, "reps": 5, "weightKg": null }
      ],
      "restSeconds": 120,
      "note": ""
    }
  ]
}
```

### `gym_log_latest`

Return the most recent entry for an exercise.

Input:

```json
{
  "exercise": "Dumbbell Bench Press"
}
```

Output: same row shape as `gym_log_search`.

### `gym_log_append`

Append one exercise row to the current workout date.

Input:

```json
{
  "date": "2026-06-25",
  "exercise": "Dumbbell Bench Press",
  "sets": [
    { "set": 1, "reps": 10, "weightKg": 25 }
  ],
  "restSeconds": 120,
  "note": ""
}
```

Behavior:

- If this is the first row for `date`, write the date in column `Ngày`.
- If the previous row already has the same date, leave `Ngày` blank to match the sheet style.
- Preserve columns for up to 4 sets.

### Future: `gym_log_update_set`

Update a specific set in an existing row.

Input:

```json
{
  "date": "2026-06-25",
  "exercise": "Dumbbell Bench Press",
  "set": 1,
  "reps": 10,
  "weightKg": 25
}
```

Behavior:

- Find exact date plus normalized exercise name.
- Update only the target set cells.
- Return an error if multiple rows match after normalization.

## Parser Rules

Normalize every sheet row into this internal shape:

```ts
type WorkoutSet = {
  set: 1 | 2 | 3 | 4;
  reps: number | null;
  weightKg: number | null;
};

type WorkoutEntry = {
  rowNumber: number;
  date: string; // ISO yyyy-mm-dd
  exercise: string;
  exerciseKey: string;
  sets: WorkoutSet[];
  restSeconds: number | null;
  note: string;
};
```

Normalization:

- `exerciseKey = exercise.trim().toLowerCase().replace(/\s+/g, " ")`
- Parse `dd/MM/yyyy` into ISO date.
- Parse numbers after replacing comma decimal separators with dots.
- Treat blank set values as `null`.
- Carry forward the most recent non-empty `Ngày`.

Data quality checks:

- Flag impossible weights such as `254` if neighboring entries suggest `25` or `27,5`.
- Flag out-of-order dates, for example a `21/05/2026` row after `18/06/2026`.
- Do not silently fix suspicious data during normal query calls; mention it in the answer or expose a validation tool later.

## Agent Behavior

For read questions:

- Extract exercise name from the user message.
- Call `gym_log_latest` for "lần gần nhất".
- Call `gym_log_search` for "hôm trước", "lịch sử", or comparison questions.
- Answer with date, sets, reps, weights, rest time, and note if available.

For write requests:

- If the user gives no date, default to today in the OpenClaw server timezone.
- If the user gives only one set, call `gym_log_append` with that set.
- If the user references an existing day/exercise/set, call `gym_log_update_set`.
- Confirm the exact row written after the tool succeeds.

Example answer:

```text
Lần gần nhất bạn tập Pull-ups là 21/06/2026: set 1 9 rep, set 2 8 rep, set 3 5 rep, nghỉ 120 giây.
```

Example write confirmation:

```text
Đã ghi Dumbbell Bench Press ngày 25/06/2026: set 1, 10 rep, 25 kg.
```

## Google Sheets Access

Use a Google Cloud service account or OAuth client.

Recommended for personal deployment:

- Create a Google Cloud project.
- Enable Google Sheets API.
- Create a service account.
- Share the workout sheet with the service account email.
- Store credentials outside the plugin source, for example:
  - `/opt/appdata/openclaw/plugin/gym/google-service-account.json`
  - environment variable `GYM_GOOGLE_APPLICATION_CREDENTIALS`

Plugin config:

```json
{
  "spreadsheetId": "google-sheet-id",
  "sheetName": "Gym",
  "credentialsPath": "/opt/appdata/openclaw/plugin/gym/google-service-account.json",
  "defaultRestSeconds": 120
}
```

Do not store Google credentials in `AGENTS.md`, git, or chat-visible memory.

## Deployment Notes

For the current OpenClaw stack:

- Put credentials under `/opt/appdata/openclaw/plugin/gym`.
- Mount that path read-only into `openclaw-gateway`.
- Install the plugin in the OpenClaw workspace or as a local plugin package.
- Allowlist only the gym tools for the assistant profile if you want tighter control.

Minimal persistent path to add:

```text
/opt/appdata/openclaw/plugin/gym:/opt/appdata/openclaw/plugin/gym:ro
```

## Test Cases

Read tests:

- Query latest `Pull-ups` returns the most recent normalized date.
- Query `Dumbbell Bench Press` matches `Dumbbell Bench Press ` with trailing space.
- Decimal weights parse `12,5` as `12.5`.
- Blank date cells inherit the previous date.

Write tests:

- Append first exercise of a new date writes the date cell.
- Append second exercise on the same date leaves the date cell blank.
- Updating set 1 changes only the two cells for set 1.
- Ambiguous duplicate rows return a clear error.

## First Implementation Slice

1. Build the OpenClaw tool plugin with `gym_log_latest`, `gym_log_search`, and `gym_log_append`.
2. Add a workspace skill `gym-assistant/SKILL.md` that routes gym journal questions to those tools.
3. Deploy credentials and config on the Ubuntu host.
4. Smoke test from WebChat:
   - "Lần gần nhất tôi tập Pull-ups được mấy rep?"
   - "Pull-ups set 1 10 rep"
