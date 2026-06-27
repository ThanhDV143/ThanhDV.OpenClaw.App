import { mkdir, rename, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { opendir } from "node:fs/promises";
import type { NasPackageRecord, ResolvedConfig } from "./types.ts";
import { sha256Text } from "./hash.ts";

export async function scanNasPackages(config: ResolvedConfig): Promise<{ packages: NasPackageRecord[]; errors: string[] }> {
  const packages: NasPackageRecord[] = [];
  const errors: string[] = [];

  for (const root of config.nasPackageRoots) {
    try {
      for await (const filePath of walkUnityPackages(root)) {
        const fileStat = await stat(filePath);
        const relativePath = normalizePath(relative(root, filePath));
        packages.push({
          id: nasPackageId(root, relativePath),
          source: "nas",
          name: basename(filePath),
          description: null,
          keywords: pathKeywords(relativePath),
          fingerprint: nasFingerprint(filePath, fileStat.size, fileStat.mtimeMs),
          path: filePath,
          root,
          relativePath,
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
        });
      }
    } catch (error) {
      errors.push(`${root}: ${errorMessage(error)}`);
    }
  }

  return { packages, errors };
}

export async function currentNasFingerprint(record: NasPackageRecord): Promise<string> {
  const fileStat = await stat(record.path);
  return nasFingerprint(record.path, fileStat.size, fileStat.mtimeMs);
}

export async function archiveNasPackage(record: NasPackageRecord, config: ResolvedConfig): Promise<{ archivedPath: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = join(config.nasTrashRoot, timestamp, record.relativePath);
  await mkdir(dirname(archivePath), { recursive: true });
  await rename(record.path, archivePath);

  return { archivedPath: archivePath };
}

export function nasPackageId(root: string, relativePath: string): string {
  return `nas:${sha256Text(`${normalizePath(root)}\0${normalizePath(relativePath)}`).slice(0, 24)}`;
}

export function nasFingerprint(path: string, sizeBytes: number, modifiedTimeMs: number): string {
  return sha256Text(`${normalizePath(path)}\0${sizeBytes}\0${Math.floor(modifiedTimeMs)}`);
}

async function* walkUnityPackages(root: string): AsyncGenerator<string> {
  const entries = await opendir(root);
  for await (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".trash") {
        continue;
      }
      yield* walkUnityPackages(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".unitypackage")) {
      yield fullPath;
    }
  }
}

function pathKeywords(relativePath: string): string[] {
  return Array.from(
    new Set(
      relativePath
        .replace(/\.unitypackage$/i, "")
        .split(/[\\/._\-\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 1),
    ),
  );
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
