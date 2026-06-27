# Gym Assistant

OpenClaw capability for querying and updating a Google Sheets workout journal from chat.

## Pieces

- `docs/spec.md`: feature behavior, sheet parser rules, and tool contract.
- `plugin/`: OpenClaw tool plugin for Google Sheets reads, analytics, and writes.
- `skill/`: OpenClaw skill instructions for routing gym questions to the plugin tools.
- `tests/`: fixtures and integration notes for parser and write behavior.

## Installation

### 1. Prepare The Google Sheet

The Google Sheet must contain at least these two tabs:

```text
Gym
Plan
```

`Gym` stores the workout journal.

`Plan` stores the training plan.

### 2. Create A Google Cloud Service Account

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a Google Cloud project.
3. Enable the Google Sheets API for that project.
4. Go to `IAM & Admin` -> `Service Accounts`.
5. Create a service account, for example `openclaw-gym-assistant`.
6. Open the service account detail page.
7. Go to the `Keys` tab.
8. Click `Add key` -> `Create new key`.
9. Choose `JSON`, then click `Create`.
10. Google Cloud will download a `.json` file. This file is the credentials file used by the plugin.

The downloaded JSON credentials file contains fields like:

Example:

```json
{
  "type": "service_account",
  "project_id": "your-project",
  "client_email": "openclaw-gym-assistant@your-project.iam.gserviceaccount.com"
}
```

Use this same file as:

```text
/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
```

The service account email is shown in Google Cloud Console and is also inside this JSON file as `client_email`.

Open the Google Sheet, click `Share`, and share it with that `client_email`. Give it `Editor` access so the plugin can add, update, and delete workout rows.

### 3. Prepare Credentials On The Server

On the OpenClaw server:

```bash
mkdir -p /opt/appdata/openclaw/plugin/gym/credentials
```

Copy the service account JSON file to:

```text
/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
```

Set file permissions:

```bash
chmod 600 /opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
```

Do not commit credentials, spreadsheet IDs, or exported personal workout data.

### 4. Mount Folders Into The Container

In the `openclaw-gateway` stack or compose file, mount the credential and plugin folders:

```yaml
volumes:
  - /opt/appdata/openclaw/plugin/gym:/opt/appdata/openclaw/plugin/gym:ro
  - /opt/appdata/openclaw/plugin/gym/plugin:/app/dist/extensions/gym-assistant:ro
```

Credential path inside the container:

```text
/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
```

Plugin path on the server:

```text
/opt/appdata/openclaw/plugin/gym/plugin
```

Plugin path inside the container:

```text
/app/dist/extensions/gym-assistant
```

### 5. Configure The Plugin In OpenClaw

Edit the OpenClaw runtime config used by `openclaw-gateway`.

The exact file path depends on the deployment, but it is usually one of the config files mounted into the gateway container from your server appdata folder. For example:

```text
/opt/appdata/openclaw/config.json
```

or a config file referenced by the `openclaw-gateway` stack/compose environment.

Add or merge this block into the top-level config:

```json
{
  "plugins": {
    "entries": {
      "gym-assistant": {
        "enabled": true,
        "config": {
          "spreadsheetId": "<GOOGLE_SHEET_ID>",
          "sheetName": "Gym",
          "planSheetName": "Plan",
          "credentialsPath": "/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json",
          "defaultRestSeconds": 120,
          "aliasStorePath": "/home/node/.openclaw/gym-assistant/exercise-aliases.json"
        }
      }
    }
  }
}
```

Replace:

- `<GOOGLE_SHEET_ID>` with the ID from the Google Sheet URL.
- `sheetName` with the workout tab name. Default: `Gym`.
- `planSheetName` with the plan tab name. Default: `Plan`.
- `credentialsPath` with the credential path inside the container.
- `aliasStorePath` with a writable path inside the container.

The Google Sheet URL looks like:

```text
https://docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/edit
```

Only copy the part between `/d/` and `/edit`.

Make sure these two paths mean different things:

```text
/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
```

This is the credential file mounted read-only into the container.

```text
/home/node/.openclaw/gym-assistant/exercise-aliases.json
```

This is the alias memory file created and updated by the plugin. It must be writable by the gateway container.

After changing the config, restart `openclaw-gateway` in step 9.

### 6. Build The Plugin

Push the code to GitHub.

Open GitHub Actions and wait for the `Gym Plugin CI` workflow to finish.

Download the artifact:

```text
gym-assistant-dist.zip
```

### 7. Upload The Plugin

Place the zip file anywhere on your local machine.

Double click the generic plugin upload script:

```text
deploy/upload-openclaw-plugin.cmd
```

Or run it with the existing gym remote path:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\upload-openclaw-plugin.ps1 `
  -ArtifactZip "C:\Users\<you>\Downloads\gym-assistant-dist.zip" `
  -Server "<OPENCLAW_HOST>" `
  -User "<SSH_USER>" `
  -RemotePath "/opt/appdata/openclaw/plugin/gym/plugin"
```

If the server requires an SSH password, the upload window will prompt for it.

### 8. Seed Exercise Aliases

Run this only on first install, or when the alias file does not exist yet:

```bash
docker exec openclaw-gateway sh -lc 'node /app/dist/extensions/gym-assistant/scripts/install-seed-aliases.mjs /app/dist/extensions/gym-assistant/seed/exercise-aliases.seed.json /home/node/.openclaw/gym-assistant/exercise-aliases.json'
```

Do not run this to overwrite the real alias store after you have used the plugin for a while.

### 9. Restart OpenClaw

After upload:

```bash
docker restart openclaw-gateway
```

### 10. Check That The Plugin Loaded

Check logs:

```bash
docker logs --tail 200 openclaw-gateway
```

Look for `gym-assistant`.

### 11. Test From Chat

Try:

```text
Lần gần nhất tôi tập Pull-ups được mấy rep?
```

```text
Hôm nay tôi tập gì?
```

```text
Chống đẩy 3 set 5 5 5
```

Analytics:

```text
Vẽ biểu đồ tiến độ Pull-ups 3 tháng gần đây theo tuần
```

```text
Tôi tập đều không trong 6 tháng gần đây?
```

For edit/delete:

```text
Sửa bài Pull-ups hôm nay set 2 thành 8 rep
```

OpenClaw must find the target row and ask for confirmation before applying the change.

### Local Build Commands

From `capabilities/gym-assistant/plugin`:

```powershell
npm test
npm run build
npm run plugin:check
```

If Node is not on `PATH` in this workspace, use the bundled Codex Node executable for tests:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test .\tests\*.test.ts
```
