import type { AppendWorkoutInput, GymPluginConfig } from "./types.ts";
import { latestEntry, parseWorkoutRows, searchEntries } from "./parser.ts";
import { resolveConfig } from "./config.ts";
import { appendWorkoutEntry, readWorkoutRows } from "./sheets.ts";

export async function gymLogLatest(params: { exercise: string }, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const rows = await readWorkoutRows(resolvedConfig);
  const entry = latestEntry(parseWorkoutRows(rows), params.exercise);

  return {
    exercise: params.exercise,
    entry,
  };
}

export async function gymLogSearch(params: { exercise: string; limit?: number }, config: GymPluginConfig = {}) {
  const resolvedConfig = resolveConfig(config);
  const rows = await readWorkoutRows(resolvedConfig);

  return {
    exercise: params.exercise,
    matches: searchEntries(parseWorkoutRows(rows), params.exercise, params.limit ?? 5),
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

