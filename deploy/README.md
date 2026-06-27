# Deployment

Deployment notes for the self-hosted OpenClaw stack.

Current target from project context:

- Docker host: `<OPENCLAW_HOST>`
- Main container: `openclaw-gateway`
- Public URL: `<OPENCLAW_PUBLIC_URL>`

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

### Upload Plugin Artifact From Windows

Use the generic OpenClaw plugin upload script for any plugin artifact. The script extracts the zip, validates `openclaw.plugin.json`, uploads to a temporary folder under `/tmp`, then installs into `/opt/appdata/openclaw/plugin/...` with `sudo`.

Your SSH user must be allowed to run `sudo` on the Docker host.

Without SSH key authentication, the script may still ask for the SSH password for upload and again for the sudo install step. To avoid repeated SSH password prompts, configure an SSH key or agent for `<SSH_USER>@<OPENCLAW_HOST>`.

Double click:

```text
deploy/upload-openclaw-plugin.cmd
```

Or run manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\upload-openclaw-plugin.ps1 `
  -ArtifactZip "C:\Users\<you>\Downloads\gym-assistant-dist.zip" `
  -Server "<OPENCLAW_HOST>" `
  -User "<SSH_USER>" `
  -RemotePath "/opt/appdata/openclaw/plugin/gym/plugin"
```

## Unity Package Catalog

The plugin artifact should be installed on the Docker host at:

```text
/opt/appdata/openclaw/plugin/unity-package-catalog/plugin
```

Mount the plugin and NAS package folder into `openclaw-gateway`:

```text
/opt/appdata/openclaw/plugin/unity-package-catalog/plugin:/app/dist/extensions/unity-package-catalog:ro
<HOST_UNITYPKGS_PATH>:/data/unitypkgs
```

Set the Verdaccio token in the OpenClaw stack environment:

```text
VERDACCIO_TOKEN=<secret>
```

Use plugin config similar to:

```json
{
  "verdaccioRegistryUrl": "<VERDACCIO_REGISTRY_URL>",
  "verdaccioTokenEnvVar": "VERDACCIO_TOKEN",
  "nasPackageRoots": ["/data/unitypkgs"],
  "nasTrashRoot": "/data/unitypkgs/.trash",
  "indexPath": "/home/node/.openclaw/unity-package-index.json",
  "indexMaxAgeHours": 24
}
```

Upload example:

```powershell
powershell -ExecutionPolicy Bypass -File .\upload-openclaw-plugin.ps1 `
  -ArtifactZip "C:\Users\<you>\Downloads\unity-package-catalog-dist.zip" `
  -Server "<OPENCLAW_HOST>" `
  -User "<SSH_USER>" `
  -RemotePath "/opt/appdata/openclaw/plugin/unity-package-catalog/plugin"
```
