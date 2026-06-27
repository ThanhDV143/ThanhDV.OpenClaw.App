import type { ResolvedConfig, UnityPackageCatalogConfig } from "./types.ts";

export function resolveConfig(config: UnityPackageCatalogConfig = {}): ResolvedConfig {
  return {
    verdaccioRegistryUrl: trimTrailingSlash(config.verdaccioRegistryUrl ?? "https://upm.thanhdv.com"),
    verdaccioTokenEnvVar: config.verdaccioTokenEnvVar ?? "VERDACCIO_TOKEN",
    nasPackageRoots: normalizeStringArray(config.nasPackageRoots, ["/data/unitypkgs"]),
    nasTrashRoot: config.nasTrashRoot ?? "/data/unitypkgs/.trash",
    indexPath: config.indexPath ?? "/home/node/.openclaw/unity-package-index.json",
    indexMaxAgeHours: positiveNumber(config.indexMaxAgeHours, 24),
  };
}

function normalizeStringArray(value: string[] | undefined, fallback: string[]): string[] {
  const normalized = (value ?? fallback).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

