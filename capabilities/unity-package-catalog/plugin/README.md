# Unity Package Catalog Plugin

OpenClaw tool plugin for indexing, searching, reading, and safely deleting Unity packages from:

- Verdaccio registry: `https://upm.thanhdv.com`
- NAS-mounted `.unitypackage` files: `/data/unitypkgs`

Default config:

```json
{
  "verdaccioRegistryUrl": "https://upm.thanhdv.com",
  "verdaccioTokenEnvVar": "VERDACCIO_TOKEN",
  "nasPackageRoots": ["/data/unitypkgs"],
  "nasTrashRoot": "/data/unitypkgs/.trash",
  "indexPath": "/home/node/.openclaw/unity-package-index.json",
  "indexMaxAgeHours": 24
}
```

Deletion is always two-step: find a candidate, show it to the user, then delete only after a separate confirmation.

