import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, rename, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { opendir } from "node:fs/promises";
import type { NasPackageRecord, ResolvedConfig } from "./types.ts";
import { sha256Text } from "./hash.ts";

export async function scanNasPackages(config: ResolvedConfig): Promise<{ packages: NasPackageRecord[]; errors: string[] }> {
  const packages: NasPackageRecord[] = [];
  const errors: string[] = [];

  for (const root of config.nasPackageRoots) {
    try {
      for await (const filePath of walkUnityPackages(root)) {
        packages.push(await nasRecordForFile(root, filePath));
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

export async function importNasPackageFile(
  params: { sourceFilePath: string; targetFolder?: string; targetName?: string; overwrite?: boolean },
  config: ResolvedConfig,
): Promise<{ record: NasPackageRecord; copiedTo: string; overwritten: boolean }> {
  if (config.nasPackageRoots.length === 0) {
    throw new Error("No NAS package root is configured.");
  }

  if (extname(params.sourceFilePath).toLowerCase() !== ".unitypackage") {
    throw new Error("Only .unitypackage files can be imported.");
  }

  const sourceStat = await stat(params.sourceFilePath);
  if (!sourceStat.isFile()) {
    throw new Error("Import source must be a file.");
  }

  const root = config.nasPackageRoots[0];
  const targetName = safePackageFileName(params.targetName ?? basename(params.sourceFilePath));
  const targetFolder = safeRelativeFolder(params.targetFolder ?? "");
  const targetPath = resolve(root, targetFolder, targetName);
  ensurePathInsideRoot(root, targetPath);

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(params.sourceFilePath, targetPath, params.overwrite ? 0 : fsConstants.COPYFILE_EXCL);

  return {
    record: await nasRecordForFile(root, targetPath),
    copiedTo: targetPath,
    overwritten: params.overwrite === true,
  };
}

export async function nasRecordForFile(root: string, filePath: string): Promise<NasPackageRecord> {
  const fileStat = await stat(filePath);
  const relativePath = normalizePath(relative(root, filePath));

  return {
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
  };
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

function safePackageFileName(value: string): string {
  if (value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new Error("targetName must be a file name, not a path.");
  }

  if (extname(value).toLowerCase() !== ".unitypackage") {
    throw new Error("targetName must end with .unitypackage.");
  }

  const sanitized = value.replace(/[<>:"|?*\x00-\x1f]/g, "_").trim();
  if (!sanitized || sanitized === ".unitypackage") {
    throw new Error("targetName is empty after sanitization.");
  }

  return sanitized;
}

function safeRelativeFolder(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.includes("\0")) {
    throw new Error("targetFolder must be a relative folder inside the NAS package root.");
  }

  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("targetFolder cannot contain . or .. segments.");
  }
  if (parts[0] === ".trash") {
    throw new Error("targetFolder cannot target the trash folder.");
  }

  return join(...parts.map((part) => part.replace(/[<>:"|?*\x00-\x1f]/g, "_")));
}

function ensurePathInsideRoot(root: string, targetPath: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(targetPath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("Target path escapes the NAS package root.");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
