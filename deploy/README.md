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
GYM_GOOGLE_APPLICATION_CREDENTIALS=/opt/appdata/openclaw/plugin/gym/credentials/google-service-account.json
GYM_DEFAULT_REST_SECONDS=120
GYM_EXERCISE_ALIAS_PATH=/home/node/.openclaw/gym-assistant/exercise-aliases.json
```
