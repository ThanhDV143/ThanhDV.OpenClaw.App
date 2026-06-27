import type { ResolvedConfig, VerdaccioPackageRecord } from "./types.ts";
import { previewText, sha256Text } from "./hash.ts";

type Packument = {
  name?: string;
  description?: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, VersionMetadata>;
  readme?: string;
  _rev?: string;
  time?: Record<string, string>;
};

type VersionMetadata = {
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  dist?: {
    shasum?: string;
    integrity?: string;
    tarball?: string;
  };
};

export async function fetchVerdaccioPackages(config: ResolvedConfig): Promise<{ packages: VerdaccioPackageRecord[]; errors: string[] }> {
  const errors: string[] = [];

  try {
    const names = await fetchPackageNames(config);
    const packages: VerdaccioPackageRecord[] = [];

    for (const name of names) {
      try {
        packages.push(toVerdaccioRecord(config, await fetchPackument(config, name)));
      } catch (error) {
        errors.push(`${name}: ${errorMessage(error)}`);
      }
    }

    return { packages, errors };
  } catch (error) {
    return { packages: [], errors: [errorMessage(error)] };
  }
}

export async function fetchPackument(config: ResolvedConfig, packageName: string): Promise<Packument> {
  return registryJson(config, encodedPackagePath(packageName));
}

export async function deleteVerdaccioPackage(config: ResolvedConfig, packageName: string, expectedFingerprint: string) {
  const packument = await fetchPackument(config, packageName);
  const currentFingerprint = packageFingerprint(packument);
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error("Verdaccio package metadata changed after confirmation. Refresh the delete candidate and confirm again.");
  }

  const revision = requiredRevision(packument);
  await registryRequest(config, `${encodedPackagePath(packageName)}/-rev/${encodeURIComponent(revision)}`, {
    method: "DELETE",
  });

  return { deleted: true, deleteScope: "package" as const, packageName, revision };
}

export async function deleteVerdaccioVersion(
  config: ResolvedConfig,
  packageName: string,
  version: string,
  expectedFingerprint: string,
) {
  const packument = await fetchPackument(config, packageName);
  const currentFingerprint = versionFingerprint(packument, version);
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error("Verdaccio package version metadata changed after confirmation. Refresh the delete candidate and confirm again.");
  }

  const revision = requiredRevision(packument);
  const nextPackument = buildVersionRemovalPackument(packument, version);
  await registryRequest(config, `${encodedPackagePath(packageName)}/-rev/${encodeURIComponent(revision)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextPackument),
  });

  return { deleted: true, deleteScope: "version" as const, packageName, version, revision };
}

export function toVerdaccioRecord(config: ResolvedConfig, packument: Packument): VerdaccioPackageRecord {
  const name = requiredPackageName(packument);
  const versions = Object.keys(packument.versions ?? {}).sort(compareVersions);
  const latestVersion = packument["dist-tags"]?.latest ?? versions.at(-1) ?? null;
  const latestMetadata = latestVersion ? packument.versions?.[latestVersion] : undefined;

  return {
    id: verdaccioPackageId(name),
    source: "verdaccio",
    name,
    description: packument.description ?? latestMetadata?.description ?? null,
    keywords: normalizeKeywords(latestMetadata?.keywords),
    fingerprint: packageFingerprint(packument),
    registryUrl: config.verdaccioRegistryUrl,
    latestVersion,
    versions,
    distTags: packument["dist-tags"] ?? {},
    revision: packument._rev ?? null,
    readmePreview: previewText(packument.readme),
  };
}

export function buildVersionRemovalPackument(packument: Packument, version: string): Packument {
  if (!packument.versions?.[version]) {
    throw new Error(`Package version does not exist: ${version}`);
  }

  const versions = { ...packument.versions };
  delete versions[version];

  const remainingVersions = Object.keys(versions).sort(compareVersions);
  if (remainingVersions.length === 0) {
    throw new Error("Cannot delete the only version as a version delete. Use package delete instead.");
  }

  const distTags = { ...(packument["dist-tags"] ?? {}) };
  let latestWasRemoved = false;
  for (const [tag, taggedVersion] of Object.entries(distTags)) {
    if (taggedVersion === version) {
      delete distTags[tag];
      if (tag === "latest") {
        latestWasRemoved = true;
      }
    }
  }

  if (latestWasRemoved && !distTags.latest) {
    distTags.latest = remainingVersions.at(-1)!;
  }

  const time = packument.time ? { ...packument.time } : undefined;
  if (time) {
    delete time[version];
  }

  return {
    ...packument,
    "dist-tags": distTags,
    versions,
    time,
  };
}

export function packageFingerprint(packument: Packument): string {
  return sha256Text(`${requiredPackageName(packument)}\0${packument._rev ?? ""}\0${Object.keys(packument.versions ?? {}).join(",")}`);
}

export function versionFingerprint(packument: Packument, version: string): string {
  const metadata = packument.versions?.[version];
  if (!metadata) {
    throw new Error(`Package version does not exist: ${version}`);
  }

  return sha256Text(
    [
      requiredPackageName(packument),
      version,
      packument._rev ?? "",
      metadata.dist?.integrity ?? "",
      metadata.dist?.shasum ?? "",
      metadata.dist?.tarball ?? "",
    ].join("\0"),
  );
}

export function verdaccioPackageId(packageName: string): string {
  return `verdaccio:${packageName}`;
}

export function packageNameFromVerdaccioId(id: string): string {
  if (!id.startsWith("verdaccio:")) {
    throw new Error(`Not a Verdaccio package id: ${id}`);
  }
  return id.slice("verdaccio:".length);
}

export function encodedPackagePath(packageName: string): string {
  return encodeURIComponent(packageName);
}

function requiredPackageName(packument: Packument): string {
  if (!packument.name) {
    throw new Error("Verdaccio package metadata is missing name.");
  }
  return packument.name;
}

function requiredRevision(packument: Packument): string {
  if (!packument._rev) {
    throw new Error("Verdaccio package metadata is missing _rev.");
  }
  return packument._rev;
}

async function fetchPackageNames(config: ResolvedConfig): Promise<string[]> {
  const allPackages = await registryJson<Record<string, unknown>>(config, "-/all");
  return Object.keys(allPackages)
    .filter((name) => !name.startsWith("_"))
    .sort((left, right) => left.localeCompare(right));
}

async function registryJson<T = unknown>(config: ResolvedConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await registryRequest(config, path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  return (await response.json()) as T;
}

async function registryRequest(config: ResolvedConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${config.verdaccioRegistryUrl}/${path}`, {
    ...init,
    headers: {
      ...authHeaders(config),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Verdaccio request failed ${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }

  return response;
}

function authHeaders(config: ResolvedConfig): Record<string, string> {
  const token = process.env[config.verdaccioTokenEnvVar];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const byPart = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (byPart !== 0) {
      return byPart;
    }
  }
  return left.localeCompare(right);
}

function parseVersion(value: string): number[] {
  return value.split(/[.-]/).map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
