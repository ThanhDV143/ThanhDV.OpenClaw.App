import type { WorkoutEntry, WorkoutSet, WorkoutSetNumber } from "./types.ts";

const SET_COLUMNS: Array<{ set: WorkoutSetNumber; reps: number; weight: number }> = [
  { set: 1, reps: 2, weight: 3 },
  { set: 2, reps: 4, weight: 5 },
  { set: 3, reps: 6, weight: 7 },
  { set: 4, reps: 8, weight: 9 },
];

export function normalizeExerciseName(value: unknown): string {
  return stringifyCell(value).trim().replace(/\s+/g, " ");
}

export function exerciseKey(value: unknown): string {
  return normalizeExerciseName(value).toLowerCase();
}

export function parseWorkoutRows(rows: unknown[][]): WorkoutEntry[] {
  const entries: WorkoutEntry[] = [];
  let currentDate: string | null = null;

  for (let index = 2; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const dateCell = stringifyCell(row[0]).trim();
    const exercise = normalizeExerciseName(row[1]);

    if (dateCell) {
      currentDate = parseDateCell(dateCell);
    }

    if (!exercise || !currentDate) {
      continue;
    }

    entries.push({
      rowNumber: index + 1,
      date: currentDate,
      exercise,
      exerciseKey: exerciseKey(exercise),
      sets: parseSets(row),
      restSeconds: parseNumberCell(row[10]),
      note: stringifyCell(row[11]).trim(),
    });
  }

  return entries;
}

export function searchEntries(entries: WorkoutEntry[], exercise: string, limit = 5): WorkoutEntry[] {
  const key = exerciseKey(exercise);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit || 5)));

  return entries
    .filter((entry) => entry.exerciseKey === key)
    .sort(compareNewestFirst)
    .slice(0, safeLimit);
}

export function latestEntry(entries: WorkoutEntry[], exercise: string): WorkoutEntry | null {
  return searchEntries(entries, exercise, 1)[0] ?? null;
}

export function buildAppendRow(input: {
  dateCell: string;
  exercise: string;
  sets: WorkoutSet[];
  restSeconds: number | null;
  note: string;
}): Array<string | number> {
  const row: Array<string | number> = new Array(12).fill("");
  row[0] = input.dateCell;
  row[1] = normalizeExerciseName(input.exercise);
  row[10] = input.restSeconds ?? "";
  row[11] = input.note;

  for (const workoutSet of input.sets) {
    const column = SET_COLUMNS.find((candidate) => candidate.set === workoutSet.set);
    if (!column) {
      continue;
    }
    row[column.reps] = workoutSet.reps ?? "";
    row[column.weight] = workoutSet.weightKg ?? "";
  }

  return row;
}

export function parseDateCell(value: unknown): string {
  if (value instanceof Date) {
    return toIsoDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return googleSerialDateToIso(value);
  }

  const text = stringifyCell(value).trim();
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) {
    return text;
  }

  throw new Error(`Unsupported date value: ${text}`);
}

export function parseNumberCell(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = stringifyCell(value).trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatSheetDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return parseDateCell(isoDate).split("-").reverse().join("/");
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseSets(row: unknown[]): WorkoutSet[] {
  const sets: WorkoutSet[] = [];

  for (const column of SET_COLUMNS) {
    const reps = parseNumberCell(row[column.reps]);
    const weightKg = parseNumberCell(row[column.weight]);

    if (reps === null && weightKg === null) {
      continue;
    }

    sets.push({
      set: column.set,
      reps,
      weightKg,
    });
  }

  return sets;
}

function compareNewestFirst(left: WorkoutEntry, right: WorkoutEntry): number {
  const byDate = right.date.localeCompare(left.date);
  if (byDate !== 0) {
    return byDate;
  }

  return right.rowNumber - left.rowNumber;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function googleSerialDateToIso(value: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  return toIsoDate(new Date(epoch + value * 24 * 60 * 60 * 1000));
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

