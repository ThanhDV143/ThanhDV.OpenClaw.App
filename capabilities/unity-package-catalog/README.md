# Unity Package Catalog

OpenClaw capability for searching and safely managing personal Unity packages from Verdaccio and NAS-hosted `.unitypackage` files.

## Sources

- Verdaccio registry: `<VERDACCIO_REGISTRY_URL>`
- NAS package files on Xpenology: `<DSM_UNITYPKGS_PATH>`
- NAS package files mounted into the OpenClaw container: `/data/unitypkgs`

## Plugin Tools

- `unity_package_index_refresh`: scan Verdaccio and NAS, then write the JSON index.
- `unity_package_search`: search the local index only.
- `unity_package_get`: read one indexed package by id.
- `unity_package_import_file`: import a confirmed `.unitypackage` file from a local attachment/download path into NAS and update the index.
- `unity_package_delete_candidate`: resolve an exact delete target and return a fingerprint.
- `unity_package_delete`: delete only after explicit confirmation.

Delete behavior:

- NAS `.unitypackage` files are moved into `.trash`.
- Verdaccio packages can be deleted as a whole package.
- Verdaccio package versions can be deleted one version at a time.

## Build Artifact

Push the branch and wait for the GitHub Actions workflow:

```text
Unity Package Catalog Plugin CI
```

Download the artifact:

```text
unity-package-catalog-dist.zip
```

The artifact should contain:

```text
dist/
openclaw.plugin.json
package.json
```

## Upload The Plugin

Use the generic deploy script from the repo root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\upload-openclaw-plugin.ps1 `
  -ArtifactZip "C:\Users\<you>\Downloads\unity-package-catalog-dist.zip" `
  -Server "<OPENCLAW_HOST>" `
  -User "<SSH_USER>" `
  -RemotePath "/opt/appdata/openclaw/plugin/unity-package-catalog/plugin"
```

Or double click:

```text
deploy/upload-openclaw-plugin.cmd
```

The script uploads to `/tmp` first, then installs into `/opt/appdata/openclaw/plugin/...` with `sudo`.

## Configure Portainer Stack

In the `openclaw` stack, add the plugin and NAS mounts to `openclaw-gateway`:

```yaml
volumes:
  - /opt/appdata/openclaw/plugin/unity-package-catalog/plugin:/app/dist/extensions/unity-package-catalog:ro
  - <HOST_UNITYPKGS_PATH>:/data/unitypkgs
```

Set the Verdaccio token in the Portainer stack environment:

```yaml
VERDACCIO_TOKEN=<token>
```

Then inject that stack variable into the `openclaw-gateway` service. Portainer stack variables are only used for compose substitution; they are not automatically available inside the container unless the service declares them:

```yaml
services:
  openclaw-gateway:
    environment:
      VERDACCIO_TOKEN: ${VERDACCIO_TOKEN}
```

Do not commit the real token.

## Configure OpenClaw

Edit:

```text
<OPENCLAW_CONFIG_HOST_DIR>/openclaw.json
```

Backup first:

```bash
sudo cp <OPENCLAW_CONFIG_HOST_DIR>/openclaw.json \
  <OPENCLAW_CONFIG_HOST_DIR>/openclaw.json.bak.unity-package-catalog
```

Open with nano:

```bash
sudo nano <OPENCLAW_CONFIG_HOST_DIR>/openclaw.json
```

Add this entry under `plugins.entries`:

```json
"unity-package-catalog": {
  "enabled": true,
  "config": {
    "verdaccioRegistryUrl": "<VERDACCIO_REGISTRY_URL>",
    "verdaccioTokenEnvVar": "VERDACCIO_TOKEN",
    "nasPackageRoots": ["/data/unitypkgs"],
    "nasTrashRoot": "/data/unitypkgs/.trash",
    "indexPath": "/home/node/.openclaw/unity-package-index.json",
    "indexMaxAgeHours": 24
  }
}
```

If another plugin entry appears before or after it, keep the JSON commas valid.

Validate after saving:

```bash
sudo python3 -m json.tool <OPENCLAW_CONFIG_HOST_DIR>/openclaw.json >/dev/null
```

## Redeploy And Verify

After changing stack environment or service `environment`, redeploy the stack in Portainer. A plain container restart is not enough if the container was created without the new env var.

After redeploy, a restart is fine for later config-only changes:

```bash
docker restart openclaw-gateway
```

Check the logs:

```bash
docker logs --tail 200 openclaw-gateway
```

Expected plugin list includes:

```text
unity-package-catalog
```

Verify plugin files, NAS mount, and token:

```bash
docker exec openclaw-gateway sh -lc '
ls -la /app/dist/extensions/unity-package-catalog &&
ls -la /data/unitypkgs &&
test -n "$VERDACCIO_TOKEN" &&
echo token-ok
'
```

Verify the Verdaccio token with the registry:

```bash
docker exec openclaw-gateway sh -lc 'curl -sS -i -H "Authorization: Bearer $VERDACCIO_TOKEN" <VERDACCIO_REGISTRY_URL>/-/whoami'
```

Expected result is HTTP `200`. If the container says `token-missing`, the service is not receiving `VERDACCIO_TOKEN`; check the `environment` mapping in the Portainer stack and redeploy.

## First Use

In OpenClaw chat, refresh the index:

```text
Cập nhật index package Unity
```

Then search:

```text
Tôi có package quản lý save game nào không?
```

Search uses the local index only. If the index is missing, refresh first. If the index is older than `indexMaxAgeHours`, search still returns results with a stale warning.

## Import From Chat Attachments

The plugin can import a `.unitypackage` file after OpenClaw has a local file path for the attachment. For example, a Discord or Telegram attachment should first be handled by the channel/file-transfer layer so the file exists inside the `openclaw-gateway` container.

Then ask OpenClaw to import the file:

```text
Import file .unitypackage vừa upload vào thư mục tools/save trên NAS
```

The import tool needs:

- `sourceFilePath`: local path inside the `openclaw-gateway` container.
- `targetFolder`: optional relative folder inside `/data/unitypkgs`.
- `targetName`: optional file name ending with `.unitypackage`.
- explicit confirmation text.

OpenClaw may store an uploaded `.unitypackage` attachment as a temporary `.gz` file because Unity packages are gzip/tar archives internally. That is fine: the plugin copies the bytes as-is. If `sourceFilePath` does not end with `.unitypackage`, provide `targetName`, for example `ATest.unitypackage`, so the NAS copy has the correct Unity package file name.

Import safety rules:

- The NAS target file must be named `.unitypackage`.
- `targetFolder` must be relative and cannot contain `.` or `..`.
- `targetName` cannot contain path separators and must end with `.unitypackage`.
- Existing files are not overwritten unless `overwrite=true` is explicitly confirmed.
- The index is updated after a successful import.

## Safe Delete Flow

Deletion is always two-step:

1. Ask OpenClaw to find the delete candidate.
2. Confirm the exact candidate in a separate reply.

Example:

```text
Tìm package Unity tên abc để xóa, chỉ hiển thị candidate chưa xóa
```

Only after reviewing the candidate:

```text
Xác nhận xóa package đó
```

The plugin re-checks the fingerprint before deleting. If the package or file changed after the candidate was shown, deletion is refused.
