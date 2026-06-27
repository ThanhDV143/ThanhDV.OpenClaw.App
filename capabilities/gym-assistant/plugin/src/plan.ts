import { clusterKeys } from "./alias-store.ts";
import { exerciseKey, normalizeExerciseName } from "./parser.ts";
import type {
  ClassifiedWorkoutSession,
  ExerciseAliasStore,
  PlanSession,
  PlanStatus,
  TrainingPlan,
  WorkoutEntry,
} from "./types.ts";

export function parsePlanRows(rows: unknown[][]): TrainingPlan {
  const headers = rows[0] ?? [];
  const sessions = headers
    .slice(1)
    .map((header, offset) => ({
      index: offset,
      id: `${slugify(normalizeExerciseName(header))}_${offset + 1}`,
      name: normalizeExerciseName(header),
      exercises: collectColumnExercises(rows, offset + 1),
    }))
    .filter((session) => session.name && session.exercises.length > 0);

  return {
    description: collectDescription(rows),
    sessions,
  };
}

export function buildPlanStatus(input: {
  today: string;
  plan: TrainingPlan;
  entries: WorkoutEntry[];
  aliasStore: ExerciseAliasStore;
  recentLimit?: number;
}): PlanStatus {
  const recentSessions = classifyWorkoutSessions(input.entries, input.plan, input.aliasStore)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, Math.max(1, Math.min(30, Math.floor(input.recentLimit ?? 10))));
  const lastCompletedSession = recentSessions[0] ?? null;

  return {
    today: input.today,
    plan: input.plan,
    lastCompletedSession,
    nextSession: lastCompletedSession ? nextPlanSession(input.plan.sessions, lastCompletedSession.session.index) : input.plan.sessions[0] ?? null,
    recentSessions,
  };
}

export function classifyWorkoutSessions(entries: WorkoutEntry[], plan: TrainingPlan, aliasStore: ExerciseAliasStore): ClassifiedWorkoutSession[] {
  const byDate = new Map<string, WorkoutEntry[]>();

  for (const entry of entries) {
    const current = byDate.get(entry.date) ?? [];
    current.push(entry);
    byDate.set(entry.date, current);
  }

  return [...byDate.entries()]
    .map(([date, dayEntries]) => classifyDay(date, dayEntries, plan.sessions, aliasStore))
    .filter((session): session is ClassifiedWorkoutSession => session !== null);
}

function classifyDay(date: string, dayEntries: WorkoutEntry[], sessions: PlanSession[], aliasStore: ExerciseAliasStore): ClassifiedWorkoutSession | null {
  const performedExercises = dayEntries.map((entry) => entry.exercise);
  const performedKeys = new Set(performedExercises.map((exercise) => exerciseIdentity(exercise, aliasStore)));
  let best: ClassifiedWorkoutSession | null = null;

  for (const session of sessions) {
    const matchedExercises = session.exercises.filter((exercise) => performedKeys.has(exerciseIdentity(exercise, aliasStore)));
    const score = matchedExercises.length / Math.max(1, session.exercises.length);

    if (matchedExercises.length === 0) {
      continue;
    }

    const candidate = {
      date,
      session,
      matchedExercises,
      performedExercises,
      score,
    };

    if (!best || candidate.matchedExercises.length > best.matchedExercises.length || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

function nextPlanSession(sessions: PlanSession[], currentIndex: number): PlanSession | null {
  if (sessions.length === 0) {
    return null;
  }

  return sessions[(currentIndex + 1) % sessions.length] ?? null;
}

function exerciseIdentity(value: string, aliasStore: ExerciseAliasStore): string {
  const key = exerciseKey(value);

  for (const cluster of aliasStore.clusters) {
    if (clusterKeys(cluster).has(key)) {
      return cluster.id;
    }
  }

  return key;
}

function collectDescription(rows: unknown[][]): string {
  return rows
    .slice(1)
    .map((row) => normalizeExerciseName(row[0]))
    .filter(Boolean)
    .join("\n");
}

function collectColumnExercises(rows: unknown[][], column: number): string[] {
  return rows
    .slice(1)
    .map((row) => normalizeExerciseName(row[column]))
    .filter(Boolean);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

