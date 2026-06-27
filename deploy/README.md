# Deployment

Deployment notes for the self-hosted OpenClaw stack.

Current target from project context:

- Docker host: `192.168.1.103`
- Main container: `openclaw-gateway`
- Public URL: `https://oclaw.thanhdv.com`

For personal capability credentials, prefer `/opt/appdata/openclaw/<capability>/` on the host and mount it read-only into the gateway container when possible.

## Gym Assistant

Place the Google service account credentials on the Docker host:

```text
/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
```

Mount it read-only into `openclaw-gateway`:

```text
/opt/appdata/openclaw/plugin/gym:/opt/appdata/openclaw/plugin/gym:ro
```

Set plugin config or environment variables:

```text
GYM_GOOGLE_SPREADSHEET_ID=<sheet-id>
GYM_GOOGLE_SHEET_NAME=Gym
GYM_GOOGLE_PLAN_SHEET_NAME=Plan
GYM_GOOGLE_APPLICATION_CREDENTIALS=/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
GYM_DEFAULT_REST_SECONDS=120
GYM_EXERCISE_ALIAS_PATH=/home/node/.openclaw/gym-assistant/exercise-aliases.json
```

On first install, seed alias memory after uploading the plugin artifact:

```bash
docker exec openclaw-gateway sh -lc 'node /app/dist/extensions/gym-assistant/scripts/install-seed-aliases.mjs /app/dist/extensions/gym-assistant/seed/exercise-aliases.seed.json /home/node/.openclaw/gym-assistant/exercise-aliases.json'
```

This command does not overwrite an existing alias store.

### Upload plugin artifact from Windows

Download the GitHub Actions artifact, then run the upload wizard. It asks for the zip path, server IP, SSH user, and remote plugin path.

Double click:

```text
deploy/upload-gym-assistant.cmd
```

Or run manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\upload-gym-assistant.ps1
```

Defaults:

```text
Artifact: ./gym-assistant-dist.zip
Server: thanhdv@192.168.1.103
Remote path: /opt/appdata/openclaw/plugin/gym/plugin
```

Override when needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\upload-gym-assistant.ps1 `
  -ArtifactZip "C:\Users\ThanhDV\Downloads\gym-assistant-dist.zip" `
  -Server "192.168.1.103" `
  -User "thanhdv" `
  -RemotePath "/opt/appdata/openclaw/plugin/gym/plugin"
```
