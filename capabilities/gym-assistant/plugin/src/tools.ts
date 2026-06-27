import type { AddExerciseAliasInput, AppendWorkoutInput, GymPluginConfig } from "./types.ts";
import { addExerciseAlias, readExerciseAliasStore, writeExerciseAliasStore } from "./alias-store.ts";
import { resolveExercise, searchEntriesByCluster } from "./exercise-resolver.ts";
import { buildPlanStatus, parsePlanRows } from "./plan.ts";
import { parseWorkoutRows } from "./parser.ts";
import { resolveConfig } from "./config.ts";
import { appendWorkoutEntry, readPlanRows, readWorkoutRows } from "./sheets.ts";

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

export async function gymPlanStatus(params: { today?: string; recentLimit?: number } = {}, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const [workoutRows, planRows, aliasStore] = await Promise.all([
    readWorkoutRows(resolvedConfig),
    readPlanRows(resolvedConfig),
    readExerciseAliasStore(resolvedConfig.aliasStorePath),
  ]);

  return buildPlanStatus({
    today: params.today ?? todayIsoDate(),
    plan: parsePlanRows(planRows),
    entries: parseWorkoutRows(workoutRows),
    aliasStore,
    recentLimit: params.recentLimit,
  });
}

function todayIsoDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: process.env.TZ ?? "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}
