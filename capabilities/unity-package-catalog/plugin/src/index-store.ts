import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PackageIndex, PackageRecord, ResolvedConfig } from "./types.ts";

export async function readPackageIndex(config: ResolvedConfig): Promise<PackageIndex | null> {
  try {
    return JSON.parse(await readFile(config.indexPath, "utf8")) as PackageIndex;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

export async function writePackageIndex(config: ResolvedConfig, index: PackageIndex): Promise<void> {
  await mkdir(dirname(config.indexPath), { recursive: true });
  await writeFile(config.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function buildPackageIndex(params: {
  config: ResolvedConfig;
  verdaccioPackages: PackageRecord[];
  verdaccioErrors: string[];
  nasPackages: PackageRecord[];
  nasErrors: string[];
}): PackageIndex {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      verdaccio: {
        registryUrl: params.config.verdaccioRegistryUrl,
        packageCount: params.verdaccioPackages.length,
        errors: params.verdaccioErrors,
      },
      nas: {
        roots: params.config.nasPackageRoots,
        packageCount: params.nasPackages.length,
        errors: params.nasErrors,
      },
    },
    packages: [...params.verdaccioPackages, ...params.nasPackages],
  };
}

export function indexFreshness(index: PackageIndex | null, maxAgeHours: number) {
  if (!index) {
    return {
      exists: false,
      stale: true,
      generatedAt: null,
      ageHours: null,
      maxAgeHours,
    };
  }

  const generatedAtMs = Date.parse(index.generatedAt);
  const ageHours = Number.isFinite(generatedAtMs) ? (Date.now() - generatedAtMs) / 3_600_000 : Number.POSITIVE_INFINITY;

  return {
    exists: true,
    stale: ageHours > maxAgeHours,
    generatedAt: index.generatedAt,
    ageHours,
    maxAgeHours,
  };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

