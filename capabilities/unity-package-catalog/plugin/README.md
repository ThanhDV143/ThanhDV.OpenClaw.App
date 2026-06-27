# Unity Package Catalog Plugin

OpenClaw tool plugin for indexing, searching, reading, and safely deleting Unity packages from:

- Verdaccio registry: `<VERDACCIO_REGISTRY_URL>`
- NAS-mounted `.unitypackage` files: `/data/unitypkgs`

Default config:

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

Deletion is always two-step: find a candidate, show it to the user, then delete only after a separate confirmation.

Importing `.unitypackage` files is also confirmation-gated. `unity_package_import_file` copies a local file path that is already available inside the OpenClaw container into the configured NAS package root, refuses unsafe paths, avoids overwriting by default, and updates the index after a successful import. If OpenClaw stores an uploaded Unity package as a temporary `.gz` file, pass a `.unitypackage` `targetName`; the plugin copies bytes as-is and does not inspect archive contents.
