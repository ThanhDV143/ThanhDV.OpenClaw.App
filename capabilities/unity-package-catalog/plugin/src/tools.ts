import { resolveConfig } from "./config.ts";
import { buildPackageIndex, indexFreshness, readPackageIndex, writePackageIndex } from "./index-store.ts";
import { archiveNasPackage, currentNasFingerprint, scanNasPackages } from "./nas.ts";
import { searchPackageRecords } from "./search.ts";
import type {
  DeleteCandidate,
  DeleteCandidateInput,
  DeleteInput,
  GetInput,
  NasPackageRecord,
  PackageRecord,
  RefreshInput,
  SearchInput,
  UnityPackageCatalogConfig,
  VerdaccioPackageRecord,
} from "./types.ts";
import {
  deleteVerdaccioPackage,
  deleteVerdaccioVersion,
  fetchPackument,
  fetchVerdaccioPackages,
  packageNameFromVerdaccioId,
  toVerdaccioRecord,
  versionFingerprint,
} from "./verdaccio.ts";

export async function unityPackageIndexRefresh(_params: RefreshInput = {}, config: UnityPackageCatalogConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const [verdaccio, nas] = await Promise.all([fetchVerdaccioPackages(resolvedConfig), scanNasPackages(resolvedConfig)]);
  const index = buildPackageIndex({
    config: resolvedConfig,
    verdaccioPackages: verdaccio.packages,
    verdaccioErrors: verdaccio.errors,
    nasPackages: nas.packages,
    nasErrors: nas.errors,
  });

  await writePackageIndex(resolvedConfig, index);

  return {
    refreshed: true,
    indexPath: resolvedConfig.indexPath,
    generatedAt: index.generatedAt,
    packageCount: index.packages.length,
    sources: index.sources,
  };
}

export async function unityPackageSearch(params: SearchInput = {}, config: UnityPackageCatalogConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const index = await readPackageIndex(resolvedConfig);
  const freshness = indexFreshness(index, resolvedConfig.indexMaxAgeHours);

  if (!index) {
    return {
      matches: [],
      freshness,
      message: "Unity package index does not exist. Run unity_package_index_refresh before searching.",
    };
  }

  return {
    query: params.query ?? "",
    matches: searchPackageRecords(index.packages, params).map((match) => ({
      score: match.score,
      package: summarizeRecord(match.record),
    })),
    freshness,
    message: freshness.stale ? "Unity package index is stale. Results may be incomplete until refreshed." : null,
  };
}

export async function unityPackageGet(params: GetInput, config: UnityPackageCatalogConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const index = await readPackageIndex(resolvedConfig);
  if (!index) {
    throw new Error("Unity package index does not exist. Run unity_package_index_refresh first.");
  }

  const record = findRecordById(index.packages, params.id);
  if (!record) {
    throw new Error(`Package id not found in index: ${params.id}`);
  }

  return {
    freshness: indexFreshness(index, resolvedConfig.indexMaxAgeHours),
    package: record,
  };
}

export async function unityPackageDeleteCandidate(params: DeleteCandidateInput, config: UnityPackageCatalogConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const index = await readPackageIndex(resolvedConfig);
  if (!index) {
    throw new Error("Unity package index does not exist. Run unity_package_index_refresh first.");
  }

  const resolution = resolveDeleteRecord(index.packages, params);
  if (resolution.status === "ambiguous") {
    return {
      status: "ambiguous",
      matches: resolution.matches.map((record) => summarizeRecord(record)),
      message: "Multiple packages match. Choose one exact id before deleting.",
    };
  }

  const candidate = await buildDeleteCandidate(resolution.record, params, config);
  return {
    status: "ready",
    candidate,
    confirmationRequired: true,
    message: "Show this exact candidate to the user and wait for a separate explicit confirmation before calling unity_package_delete.",
  };
}

export async function unityPackageDelete(params: DeleteInput, config: UnityPackageCatalogConfig = {}) {
  if (params.confirmed !== true || !params.userConfirmation.trim()) {
    throw new Error("Delete requires confirmed=true and a non-empty userConfirmation from a separate user reply.");
  }

  const resolvedConfig = resolveConfig(config);
  const index = await readPackageIndex(resolvedConfig);
  if (!index) {
    throw new Error("Unity package index does not exist. Run unity_package_index_refresh first.");
  }

  const record = findRecordById(index.packages, params.id);
  if (!record) {
    throw new Error(`Package id not found in index: ${params.id}`);
  }

  if (record.source === "nas") {
    if (params.deleteScope !== "nasFile") {
      throw new Error("NAS package delete requires deleteScope=nasFile.");
    }
    const currentFingerprint = await currentNasFingerprint(record);
    if (currentFingerprint !== params.expectedFingerprint) {
      throw new Error("NAS file metadata changed after confirmation. Refresh the delete candidate and confirm again.");
    }
    const archiveResult = await archiveNasPackage(record, resolvedConfig);
    await writePackageIndex(resolvedConfig, removeRecordFromIndex(index, record));

    return {
      deleted: true,
      source: "nas",
      id: record.id,
      name: record.name,
      ...archiveResult,
      indexUpdated: true,
    };
  }

  const packageName = packageNameFromVerdaccioId(record.id);
  if (params.deleteScope === "package") {
    const deleteResult = await deleteVerdaccioPackage(resolvedConfig, packageName, params.expectedFingerprint);
    await writePackageIndex(resolvedConfig, removeRecordFromIndex(index, record));

    return {
      source: "verdaccio",
      ...deleteResult,
      indexUpdated: true,
    };
  }

  if (params.deleteScope === "version") {
    if (!params.version) {
      throw new Error("Version delete requires version.");
    }
    const deleteResult = await deleteVerdaccioVersion(resolvedConfig, packageName, params.version, params.expectedFingerprint);
    const updatedRecord = toVerdaccioRecord(resolvedConfig, await fetchPackument(resolvedConfig, packageName));
    await writePackageIndex(resolvedConfig, replaceRecordInIndex(index, updatedRecord));

    return {
      source: "verdaccio",
      ...deleteResult,
      indexUpdated: true,
    };
  }

  throw new Error(`Unsupported deleteScope for Verdaccio package: ${params.deleteScope}`);
}

async function buildDeleteCandidate(
  record: PackageRecord,
  params: DeleteCandidateInput,
  config: UnityPackageCatalogConfig,
): Promise<DeleteCandidate> {
  if (record.source === "nas") {
    const expectedFingerprint = await currentNasFingerprint(record);
    return {
      id: record.id,
      source: "nas",
      deleteScope: "nasFile",
      name: record.name,
      version: null,
      expectedFingerprint,
      warnings: ["NAS delete archives the .unitypackage file into the configured trash folder."],
      record,
    };
  }

  const resolvedConfig = resolveConfig(config);
  const packageName = packageNameFromVerdaccioId(record.id);
  const liveRecord = toVerdaccioRecord(resolvedConfig, await fetchPackument(resolvedConfig, packageName));
  const deleteScope = params.deleteScope === "version" || params.version ? "version" : "package";

  if (deleteScope === "package") {
    return {
      id: liveRecord.id,
      source: "verdaccio",
      deleteScope,
      name: liveRecord.name,
      version: null,
      expectedFingerprint: liveRecord.fingerprint,
      warnings: ["Package delete removes all versions from Verdaccio."],
      record: liveRecord,
    };
  }

  if (!params.version) {
    throw new Error("Version delete candidate requires version.");
  }

  const packument = await fetchPackument(resolvedConfig, packageName);
  const warnings = versionDeleteWarnings(liveRecord, params.version);
  return {
    id: liveRecord.id,
    source: "verdaccio",
    deleteScope,
    name: liveRecord.name,
    version: params.version,
    expectedFingerprint: versionFingerprint(packument, params.version),
    warnings,
    record: liveRecord,
  };
}

function resolveDeleteRecord(records: PackageRecord[], params: DeleteCandidateInput): { status: "ready"; record: PackageRecord } | {
  status: "ambiguous";
  matches: PackageRecord[];
} {
  if (params.id) {
    const record = findRecordById(records, params.id);
    if (!record) {
      throw new Error(`Package id not found in index: ${params.id}`);
    }
    return { status: "ready", record };
  }

  if (!params.query) {
    throw new Error("Delete candidate requires id or query.");
  }

  const matches = searchPackageRecords(records, {
    query: params.query,
    source: params.source,
    limit: 5,
  }).map((match) => match.record);

  if (matches.length !== 1) {
    return { status: "ambiguous", matches };
  }

  return { status: "ready", record: matches[0] };
}

function findRecordById(records: PackageRecord[], id: string): PackageRecord | undefined {
  return records.find((record) => record.id === id);
}

function removeRecordFromIndex(index: NonNullable<Awaited<ReturnType<typeof readPackageIndex>>>, record: PackageRecord) {
  const nextSources = { ...index.sources };
  if (record.source === "verdaccio") {
    nextSources.verdaccio = {
      ...nextSources.verdaccio,
      packageCount: Math.max(0, nextSources.verdaccio.packageCount - 1),
    };
  } else {
    nextSources.nas = {
      ...nextSources.nas,
      packageCount: Math.max(0, nextSources.nas.packageCount - 1),
    };
  }

  return {
    ...index,
    sources: nextSources,
    packages: index.packages.filter((current) => current.id !== record.id),
  };
}

function replaceRecordInIndex(index: NonNullable<Awaited<ReturnType<typeof readPackageIndex>>>, record: PackageRecord) {
  return {
    ...index,
    packages: index.packages.map((current) => (current.id === record.id ? record : current)),
  };
}

function summarizeRecord(record: PackageRecord) {
  if (record.source === "verdaccio") {
    return summarizeVerdaccioRecord(record);
  }

  return summarizeNasRecord(record);
}

function summarizeVerdaccioRecord(record: VerdaccioPackageRecord) {
  return {
    id: record.id,
    source: record.source,
    name: record.name,
    description: record.description,
    latestVersion: record.latestVersion,
    versions: record.versions,
    distTags: record.distTags,
    readmePreview: record.readmePreview,
  };
}

function summarizeNasRecord(record: NasPackageRecord) {
  return {
    id: record.id,
    source: record.source,
    name: record.name,
    path: record.path,
    relativePath: record.relativePath,
    sizeBytes: record.sizeBytes,
    modifiedAt: record.modifiedAt,
  };
}

function versionDeleteWarnings(record: VerdaccioPackageRecord, version: string): string[] {
  const warnings: string[] = [];
  const tagNames = Object.entries(record.distTags)
    .filter(([, taggedVersion]) => taggedVersion === version)
    .map(([tag]) => tag);

  if (tagNames.length > 0) {
    warnings.push(`Version ${version} is referenced by dist-tags: ${tagNames.join(", ")}.`);
  }

  if (record.versions.length === 1 && record.versions[0] === version) {
    warnings.push("This is the only version. Use package delete if you intend to remove the package.");
  }

  return warnings;
}
