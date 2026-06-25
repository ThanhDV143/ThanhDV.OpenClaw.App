import type { AddExerciseAliasInput, AppendWorkoutInput, GymPluginConfig } from "./types.ts";
import { addExerciseAlias, readExerciseAliasStore, writeExerciseAliasStore } from "./alias-store.ts";
import { resolveExercise, searchEntriesByCluster } from "./exercise-resolver.ts";
import { parseWorkoutRows } from "./parser.ts";
import { resolveConfig } from "./config.ts";
import { appendWorkoutEntry, readWorkoutRows } from "./sheets.ts";

export async function gymLogLatest(params: { exercise: string; date?: string }, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const rows = await readWorkoutRows(resolvedConfig);
  const entries = parseWorkoutRows(rows);
  const store = await readExerciseAliasStore(resolvedConfig.aliasStorePath);
  const resolution = resolveExercise(params.exercise, entries, store);

  if (resolution.status !== "resolved") {
    return {
      exercise: params.exercise,
      date: params.date ?? null,
      resolution,
      entry: null,
    };
  }

  return {
    exercise: params.exercise,
    date: params.date ?? null,
    resolution,
    entry: searchEntriesByCluster(entries, resolution.cluster, 1, params.date)[0] ?? null,
  };
}

export async function gymLogSearch(params: { exercise: string; limit?: number; date?: string }, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const rows = await readWorkoutRows(resolvedConfig);
  const entries = parseWorkoutRows(rows);
  const store = await readExerciseAliasStore(resolvedConfig.aliasStorePath);
  const resolution = resolveExercise(params.exercise, entries, store);

  if (resolution.status !== "resolved") {
    return {
      exercise: params.exercise,
      date: params.date ?? null,
      resolution,
      matches: [],
    };
  }

  return {
    exercise: params.exercise,
    date: params.date ?? null,
    resolution,
    matches: searchEntriesByCluster(entries, resolution.cluster, params.limit ?? 5, params.date),
  };
}

export async function gymLogAppend(params: AppendWorkoutInput, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const result = await appendWorkoutEntry(resolvedConfig, params);

  return {
    appended: true,
    entry: result.entry,
    row: result.row,
  };
}

export async function gymAliasList(_params: Record<string, never> = {}, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const store = await readExerciseAliasStore(resolvedConfig.aliasStorePath);

  return {
    aliasStorePath: resolvedConfig.aliasStorePath,
    clusters: store.clusters,
  };
}

export async function gymAliasAdd(params: AddExerciseAliasInput, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const store = await readExerciseAliasStore(resolvedConfig.aliasStorePath);
  const nextStore = addExerciseAlias(store, params);
  await writeExerciseAliasStore(resolvedConfig.aliasStorePath, nextStore);

  return {
    updated: true,
    aliasStorePath: resolvedConfig.aliasStorePath,
    clusters: nextStore.clusters,
  };
}
