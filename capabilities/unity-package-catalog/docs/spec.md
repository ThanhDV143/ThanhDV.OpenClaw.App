# Unity Package Catalog Spec

The plugin maintains a local JSON index for Unity packages from:

- Verdaccio package metadata and README content.
- `.unitypackage` files available through a Docker bind mount.

Search reads the index only. Manual refresh scans both sources and rewrites the index. If the index is older than the configured maximum age, search still returns results with a stale warning.

Delete operations are two-step:

1. `unity_package_delete_candidate` resolves one exact package/file and returns a fingerprint.
2. `unity_package_delete` re-checks the live source, compares the fingerprint, and only then deletes.

NAS package delete moves files to `.trash`. Verdaccio delete supports package-level and version-level deletion.

