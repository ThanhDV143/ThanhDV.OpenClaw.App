import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { indexFreshness, readPackageIndex, writePackageIndex } from "../src/index-store.ts";
import { nasFingerprint, nasPackageId } from "../src/nas.ts";
import { scoreRecord } from "../src/search.ts";
import type { PackageIndex, PackageRecord } from "../src/types.ts";
import { unityPackageDelete, unityPackageImportFile, unityPackageSearch } from "../src/tools.ts";
import {
  buildVersionRemovalPackument,
  encodedPackagePath,
  packageFingerprint,
  versionFingerprint,
} from "../src/verdaccio.ts";

test("scoped Verdaccio package names are encoded as one path segment", () => {
  assert.equal(encodedPackagePath("@studio/save-game"), "%40studio%2Fsave-game");
  assert.equal(encodedPackagePath("com.example.save-game"), "com.example.save-game");
});

test("index freshness reports stale and missing states", () => {
  assert.equal(indexFreshness(null, 24).exists, false);

  const oldIndex: PackageIndex = {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    sources: {
      verdaccio: { registryUrl: "https://verdaccio.example.local", packageCount: 0, errors: [] },
      nas: { roots: ["/data/unitypkgs"], packageCount: 0, errors: [] },
    },
    packages: [],
  };

  assert.equal(indexFreshness(oldIndex, 1).stale, true);
});

test("search scoring uses package purpose fields", () => {
  const record: PackageRecord = {
    id: "verdaccio:com.example.save-game",
    source: "verdaccio",
    name: "com.example.save-game",
    description: "Save system for Unity games",
    keywords: ["unity", "persistence"],
    fingerprint: "abc",
    registryUrl: "https://verdaccio.example.local",
    latestVersion: "1.0.0",
    versions: ["1.0.0"],
    distTags: { latest: "1.0.0" },
    revision: "1-abc",
    readmePreview: "Manage save slots and game progress.",
  };

  assert.ok(scoreRecord(record, ["save", "game"]) > 0);
  assert.equal(scoreRecord(record, ["ads"]), 0);
});

test("NAS ids and fingerprints are deterministic", () => {
  assert.equal(nasPackageId("/data/unitypkgs", "tools/save.unitypackage"), nasPackageId("/data/unitypkgs", "tools/save.unitypackage"));
  assert.equal(nasFingerprint("/data/unitypkgs/save.unitypackage", 123, 456.7), nasFingerprint("/data/unitypkgs/save.unitypackage", 123, 456.9));
});

test("version delete removes version metadata and repairs latest tag", () => {
  const packument = {
    name: "com.example.save-game",
    _rev: "3-rev",
    "dist-tags": { latest: "1.2.0", beta: "1.2.0" },
    versions: {
      "1.0.0": { version: "1.0.0", dist: { shasum: "aaa" } },
      "1.2.0": { version: "1.2.0", dist: { shasum: "bbb" } },
    },
    time: {
      "1.0.0": "2026-01-01T00:00:00.000Z",
      "1.2.0": "2026-02-01T00:00:00.000Z",
    },
  };

  const nextPackument = buildVersionRemovalPackument(packument, "1.2.0");

  assert.deepEqual(Object.keys(nextPackument.versions ?? {}), ["1.0.0"]);
  assert.equal(nextPackument["dist-tags"]?.latest, "1.0.0");
  assert.equal(nextPackument["dist-tags"]?.beta, undefined);
  assert.equal(nextPackument.time?.["1.2.0"], undefined);
});

test("Verdaccio fingerprints include revision and version dist data", () => {
  const packument = {
    name: "com.example.save-game",
    _rev: "1-one",
    versions: {
      "1.0.0": { version: "1.0.0", dist: { shasum: "aaa" } },
    },
  };

  assert.notEqual(packageFingerprint(packument), packageFingerprint({ ...packument, _rev: "2-two" }));
  assert.notEqual(
    versionFingerprint(packument, "1.0.0"),
    versionFingerprint({ ...packument, versions: { "1.0.0": { version: "1.0.0", dist: { shasum: "bbb" } } } }, "1.0.0"),
  );
});

test("search tool reports a missing index without scanning sources", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unity-package-catalog-"));
  const result = await unityPackageSearch({ query: "save" }, { indexPath: join(dir, "missing-index.json") });

  assert.deepEqual(result.matches, []);
  assert.equal(result.freshness.exists, false);
  assert.ok(result.message?.includes("index does not exist"));
});

test("NAS delete archives the file and removes it from the index", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unity-package-catalog-"));
  const root = join(dir, "packages");
  const trashRoot = join(root, ".trash");
  const indexPath = join(dir, "index.json");
  await mkdir(root);

  const filePath = join(root, "save.unitypackage");
  await writeFile(filePath, "package");
  const fileStat = await stat(filePath);
  const id = nasPackageId(root, "save.unitypackage");
  const expectedFingerprint = nasFingerprint(filePath, fileStat.size, fileStat.mtimeMs);

  await writePackageIndex(
    {
      verdaccioRegistryUrl: "https://verdaccio.example.local",
      verdaccioTokenEnvVar: "VERDACCIO_TOKEN",
      nasPackageRoots: [root],
      nasTrashRoot: trashRoot,
      indexPath,
      indexMaxAgeHours: 24,
    },
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sources: {
        verdaccio: { registryUrl: "https://verdaccio.example.local", packageCount: 0, errors: [] },
        nas: { roots: [root], packageCount: 1, errors: [] },
      },
      packages: [
        {
          id,
          source: "nas",
          name: "save.unitypackage",
          description: null,
          keywords: ["save"],
          fingerprint: expectedFingerprint,
          path: filePath,
          root,
          relativePath: "save.unitypackage",
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
        },
      ],
    },
  );

  const result = await unityPackageDelete(
    {
      id,
      deleteScope: "nasFile",
      expectedFingerprint,
      confirmed: true,
      userConfirmation: "xác nhận xóa",
    },
    { nasPackageRoots: [root], nasTrashRoot: trashRoot, indexPath },
  );

  assert.equal(result.indexUpdated, true);
  assert.equal(await readFile(result.archivedPath, "utf8"), "package");

  const index = await readPackageIndex({
    verdaccioRegistryUrl: "https://verdaccio.example.local",
    verdaccioTokenEnvVar: "VERDACCIO_TOKEN",
    nasPackageRoots: [root],
    nasTrashRoot: trashRoot,
    indexPath,
    indexMaxAgeHours: 24,
  });
  assert.equal(index?.packages.length, 0);
  assert.equal(index?.sources.nas.packageCount, 0);
});

test("import file copies a .unitypackage into NAS root and updates the index", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unity-package-catalog-"));
  const root = join(dir, "packages");
  const source = join(dir, "upload.unitypackage");
  const indexPath = join(dir, "index.json");
  await mkdir(root);
  await writeFile(source, "uploaded package");

  const result = await unityPackageImportFile(
    {
      sourceFilePath: source,
      targetFolder: "tools/save",
      targetName: "save-system.unitypackage",
      confirmed: true,
      userConfirmation: "xác nhận import",
    },
    { nasPackageRoots: [root], nasTrashRoot: join(root, ".trash"), indexPath },
  );

  assert.equal(result.imported, true);
  assert.equal(await readFile(result.copiedTo, "utf8"), "uploaded package");

  const index = await readPackageIndex({
    verdaccioRegistryUrl: "https://verdaccio.example.local",
    verdaccioTokenEnvVar: "VERDACCIO_TOKEN",
    nasPackageRoots: [root],
    nasTrashRoot: join(root, ".trash"),
    indexPath,
    indexMaxAgeHours: 24,
  });

  assert.equal(index?.packages.length, 1);
  assert.equal(index?.sources.nas.packageCount, 1);
  assert.equal(index?.packages[0]?.source, "nas");
});

test("import file rejects unsafe targets and duplicate names by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unity-package-catalog-"));
  const root = join(dir, "packages");
  const source = join(dir, "upload.unitypackage");
  await mkdir(root);
  await writeFile(source, "uploaded package");

  await assert.rejects(
    () =>
      unityPackageImportFile(
        {
          sourceFilePath: source,
          targetFolder: "../escape",
          confirmed: true,
          userConfirmation: "xác nhận import",
        },
        { nasPackageRoots: [root], nasTrashRoot: join(root, ".trash"), indexPath: join(dir, "index.json") },
      ),
    /targetFolder cannot contain/,
  );

  await unityPackageImportFile(
    {
      sourceFilePath: source,
      targetName: "upload.unitypackage",
      confirmed: true,
      userConfirmation: "xác nhận import",
    },
    { nasPackageRoots: [root], nasTrashRoot: join(root, ".trash"), indexPath: join(dir, "index.json") },
  );

  await assert.rejects(
    () =>
      unityPackageImportFile(
        {
          sourceFilePath: source,
          targetName: "upload.unitypackage",
          confirmed: true,
          userConfirmation: "xác nhận import",
        },
        { nasPackageRoots: [root], nasTrashRoot: join(root, ".trash"), indexPath: join(dir, "index.json") },
      ),
    /EEXIST|exists/i,
  );
});

test("import accepts OpenClaw inbound .gz source when targetName is .unitypackage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unity-package-catalog-"));
  const root = join(dir, "packages");
  const source = join(dir, "ATest---uuid.gz");
  await mkdir(root);
  await writeFile(source, "unity package bytes");

  await assert.rejects(
    () =>
      unityPackageImportFile(
        {
          sourceFilePath: source,
          confirmed: true,
          userConfirmation: "xác nhận import",
        },
        { nasPackageRoots: [root], nasTrashRoot: join(root, ".trash"), indexPath: join(dir, "index.json") },
      ),
    /targetName ending with \.unitypackage is required/,
  );

  const result = await unityPackageImportFile(
    {
      sourceFilePath: source,
      targetName: "ATest.unitypackage",
      confirmed: true,
      userConfirmation: "xác nhận import",
    },
    { nasPackageRoots: [root], nasTrashRoot: join(root, ".trash"), indexPath: join(dir, "index.json") },
  );

  assert.equal(result.package.name, "ATest.unitypackage");
  assert.equal(await readFile(result.copiedTo, "utf8"), "unity package bytes");
});
