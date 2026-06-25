import type {
  ExerciseAliasCluster,
  ExerciseAliasStore,
  ExerciseResolveCandidate,
  ExerciseResolveResult,
  WorkoutEntry,
} from "./types.ts";
import { clusterKeys } from "./alias-store.ts";
import { exerciseKey } from "./parser.ts";

export function resolveExercise(query: string, entries: WorkoutEntry[], store: ExerciseAliasStore): ExerciseResolveResult {
  const queryKey = exerciseKey(query);

  for (const cluster of store.clusters) {
    for (const alias of [cluster.canonicalName, ...cluster.aliases]) {
      if (exerciseKey(alias) === queryKey) {
        return {
          status: "resolved",
          query,
          cluster,
          source: "alias-store",
          matchedAlias: alias,
        };
      }
    }
  }

  const exactEntry = newestEntryForKey(entries, queryKey);
  if (exactEntry) {
    return {
      status: "resolved",
      query,
      cluster: {
        id: queryKey,
        canonicalName: exactEntry.exercise,
        aliases: [exactEntry.exercise],
      },
      source: "exact-sheet-name",
      matchedAlias: exactEntry.exercise,
    };
  }

  return {
    status: "resolutionRequired",
    query,
    candidates: rankCandidates(queryKey, entries).slice(0, 8),
  };
}

export function searchEntriesByCluster(entries: WorkoutEntry[], cluster: ExerciseAliasCluster, limit = 5, date?: string): WorkoutEntry[] {
  const keys = clusterKeys(cluster);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit || 5)));

  return entries
    .filter((entry) => keys.has(entry.exerciseKey))
    .filter((entry) => !date || entry.date === date)
    .sort(compareNewestFirst)
    .slice(0, safeLimit);
}

function newestEntryForKey(entries: WorkoutEntry[], key: string): WorkoutEntry | undefined {
  return entries
    .filter((entry) => entry.exerciseKey === key)
    .sort(compareNewestFirst)[0];
}

function rankCandidates(queryKey: string, entries: WorkoutEntry[]): ExerciseResolveCandidate[] {
  const byExercise = new Map<string, ExerciseResolveCandidate>();

  for (const entry of entries) {
    const current = byExercise.get(entry.exerciseKey);
    if (!current) {
      byExercise.set(entry.exerciseKey, {
        exercise: entry.exercise,
        exerciseKey: entry.exerciseKey,
        count: 1,
        lastDate: entry.date,
        score: similarity(queryKey, entry.exerciseKey),
      });
      continue;
    }

    current.count += 1;
    if (entry.date > current.lastDate) {
      current.lastDate = entry.date;
      current.exercise = entry.exercise;
    }
  }

  return [...byExercise.values()].sort((left, right) => {
    const byScore = right.score - left.score;
    if (byScore !== 0) {
      return byScore;
    }

    const byLastDate = right.lastDate.localeCompare(left.lastDate);
    if (byLastDate !== 0) {
      return byLastDate;
    }

    return right.count - left.count;
  });
}

function similarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftTokens = new Set(left.split(/\s+/));
  const rightTokens = new Set(right.split(/\s+/));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = union > 0 ? intersection / union : 0;
  const substringScore = left.includes(right) || right.includes(left) ? 0.7 : 0;

  return Math.max(tokenScore, substringScore);
}

function compareNewestFirst(left: WorkoutEntry, right: WorkoutEntry): number {
  const byDate = right.date.localeCompare(left.date);
  if (byDate !== 0) {
    return byDate;
  }

  return right.rowNumber - left.rowNumber;
}

