import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AddExerciseAliasInput, ExerciseAliasCluster, ExerciseAliasStore } from "./types.ts";
import { exerciseKey, normalizeExerciseName } from "./parser.ts";

export const EMPTY_ALIAS_STORE: ExerciseAliasStore = {
  version: 1,
  clusters: [],
};

export async function readExerciseAliasStore(path: string): Promise<ExerciseAliasStore> {
  try {
    const store = JSON.parse(await readFile(path, "utf8")) as ExerciseAliasStore;
    return normalizeStore(store);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return EMPTY_ALIAS_STORE;
    }

    throw error;
  }
}

export async function writeExerciseAliasStore(path: string, store: ExerciseAliasStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
}

export function addExerciseAlias(store: ExerciseAliasStore, input: AddExerciseAliasInput): ExerciseAliasStore {
  const canonicalName = normalizeExerciseName(input.canonicalName);
  const alias = normalizeExerciseName(input.alias);
  const id = input.id ? slugify(input.id) : slugify(canonicalName);
  const next = normalizeStore(store);

  if (!canonicalName) {
    throw new Error("canonicalName is required.");
  }

  if (!alias) {
    throw new Error("alias is required.");
  }

  const existingCluster = findCluster(next, id, canonicalName);
  if (existingCluster) {
    existingCluster.canonicalName = canonicalName;
    existingCluster.aliases = uniqueNames([existingCluster.canonicalName, ...existingCluster.aliases, alias]);
    return next;
  }

  next.clusters.push({
    id,
    canonicalName,
    aliases: uniqueNames([canonicalName, alias]),
  });

  return next;
}

export function clusterKeys(cluster: ExerciseAliasCluster): Set<string> {
  return new Set([cluster.canonicalName, ...cluster.aliases].map((name) => exerciseKey(name)));
}

export function normalizeStore(store: ExerciseAliasStore): ExerciseAliasStore {
  return {
    version: 1,
    clusters: (store.clusters ?? []).map((cluster) => ({
      id: slugify(cluster.id || cluster.canonicalName),
      canonicalName: normalizeExerciseName(cluster.canonicalName),
      aliases: uniqueNames([cluster.canonicalName, ...(cluster.aliases ?? [])]),
    })),
  };
}

function findCluster(store: ExerciseAliasStore, id: string, canonicalName: string): ExerciseAliasCluster | undefined {
  const canonicalKey = exerciseKey(canonicalName);
  return store.clusters.find((cluster) => cluster.id === id || exerciseKey(cluster.canonicalName) === canonicalKey);
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values) {
    const name = normalizeExerciseName(value);
    const key = exerciseKey(name);

    if (!name || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(name);
  }

  return names;
}

function slugify(value: string): string {
  return normalizeExerciseName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

