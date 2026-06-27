# Gym Assistant Plugin

OpenClaw tool plugin for querying and updating the gym workout Google Sheet.

`gym_log_append` adds an exercise to the requested workout date while preserving date order. Existing dates are inserted at the end of that date block, missing dates between logged days are inserted before the next later day, and dates after the latest day are appended to the sheet.

## Local Test

This workspace may not have Node on `PATH`. If needed, run tests with the bundled Codex Node executable:

```powershell
& 'C:\Users\ThanhDV\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test .\tests\*.test.ts
```

## CI

GitHub Actions runs:

- `npm test`
- `npm run build`
- `npm run plugin:check`

The repository also keeps `npm run plugin:validate` for environments where the real OpenClaw CLI is installed. CI does not depend on that CLI yet.

## Read Strategy

Read tools use persistent alias memory outside the Google Sheet. Known aliases resolve to one exercise cluster and search all confirmed names. Unknown aliases return `resolutionRequired` with candidates; the plugin does not silently choose a fuzzy match.

## Edit/Delete Strategy

Use `gym_log_find` before `gym_log_update` or `gym_log_delete`. The find tool returns a row number and fingerprint. Update/delete rereads the sheet, refuses to apply if the fingerprint changed, and requires the user's explicit confirmation text, so OpenClaw must ask the user to confirm the exact candidate before changing data.

## Plan Strategy

`gym_plan_status` reads the `Plan` sheet and classifies recent workout days by comparing logged exercises with planned session columns. It returns the last completed session, the next planned session, and recent classified sessions so the agent can answer questions like "Hôm nay tôi tập gì?" or "Buổi lower gần nhất là hôm nào?".

## Alias Seed

The plugin ships with `seed/exercise-aliases.seed.json` for first install. Copy it to the runtime alias store only when the store does not already exist:

```bash
node /app/dist/extensions/gym-assistant/scripts/install-seed-aliases.mjs \
  /app/dist/extensions/gym-assistant/seed/exercise-aliases.seed.json \
  /home/node/.openclaw/gym-assistant/exercise-aliases.json
```

Do not overwrite the runtime alias store during normal updates because it may contain aliases learned after deployment.

## Runtime Config

The plugin reads config from OpenClaw plugin config first, then environment variables.

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

Do not commit credentials, spreadsheet IDs, or exported personal data.
