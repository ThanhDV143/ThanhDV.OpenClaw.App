# Gym Assistant Plugin

OpenClaw tool plugin for querying and appending to the gym workout Google Sheet.

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

## Runtime Config

The plugin reads config from OpenClaw plugin config first, then environment variables.

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

Do not commit credentials, spreadsheet IDs, or exported personal data.
