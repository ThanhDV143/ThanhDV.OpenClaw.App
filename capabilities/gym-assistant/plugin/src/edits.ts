import { createHash } from "node:crypto";
import type { UpdateWorkoutInput, WorkoutEntry, WorkoutLogCandidate, WorkoutSetNumber } from "./types.ts";
import { formatSheetDate, normalizeExerciseName } from "./parser.ts";

const WORKOUT_COLUMN_COUNT = 12;
const SET_COLUMNS: Array<{ set: WorkoutSetNumber; reps: number; weight: number }> = [
  { set: 1, reps: 2, weight: 3 },
  { set: 2, reps: 4, weight: 5 },
  { set: 3, reps: 6, weight: 7 },
  { set: 4, reps: 8, weight: 9 },
];

export function workoutLogCandidate(entry: WorkoutEntry, rows: unknown[][]): WorkoutLogCandidate {
  return {
    entry,
    fingerprint: workoutRowFingerprint(entry.rowNumber, rows[entry.rowNumber - 1] ?? []),
  };
}

export function workoutRowFingerprint(rowNumber: number, row: unknown[]): string {
  const normalizedRow = normalizeRow(row);
  return createHash("sha256")
    .update(JSON.stringify({ rowNumber, row: normalizedRow }))
    .digest("hex")
    .slice(0, 24);
}

export function buildUpdatedWorkoutRow(currentRow: unknown[], patch: UpdateWorkoutInput): Array<string | number> {
  const row = normalizeRow(currentRow);

  if (patch.date !== undefined) {
    row[0] = formatSheetDate(patch.date);
  }

  if (patch.exercise !== undefined) {
    const exercise = normalizeExerciseName(patch.exercise);
    if (!exercise) {
      throw new Error("Exercise name cannot be blank.");
    }
    row[1] = exercise;
  }

  if (patch.sets !== undefined) {
    for (const workoutSet of patch.sets) {
      if (workoutSet.reps !== null && workoutSet.reps < 0) {
        throw new Error(`Set ${workoutSet.set} reps cannot be negative.`);
      }
      if (workoutSet.weightKg !== null && workoutSet.weightKg < 0) {
        throw new Error(`Set ${workoutSet.set} weightKg cannot be negative.`);
      }
      const column = SET_COLUMNS.find((candidate) => candidate.set === workoutSet.set);
      if (!column) {
        continue;
      }
      row[column.reps] = workoutSet.reps ?? "";
      row[column.weight] = workoutSet.weightKg ?? "";
    }
  }

  if (patch.restSeconds !== undefined) {
    if (patch.restSeconds !== null && patch.restSeconds < 0) {
      throw new Error("restSeconds cannot be negative.");
    }
    row[10] = patch.restSeconds ?? "";
  }

  if (patch.note !== undefined) {
    row[11] = patch.note;
  }

  return row;
}

export function assertConfirmed(value: { confirmed?: boolean; userConfirmation?: string }): void {
  if (value.confirmed !== true) {
    throw new Error("Update/delete requires confirmed=true after the user confirms the exact candidate.");
  }
  if (!value.userConfirmation?.trim()) {
    throw new Error("Update/delete requires userConfirmation with the user's explicit confirmation text.");
  }
}

export function assertEditableRow(rowNumber: number, rows: unknown[][]): void {
  if (!Number.isInteger(rowNumber) || rowNumber < 3 || rowNumber > rows.length) {
    throw new Error(`Workout row ${rowNumber} is outside the editable workout data range.`);
  }
}

export function assertFingerprintMatches(rowNumber: number, row: unknown[], expectedFingerprint: string): void {
  const currentFingerprint = workoutRowFingerprint(rowNumber, row);
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error(
      `Workout row ${rowNumber} changed after confirmation. Expected ${expectedFingerprint}, current ${currentFingerprint}.`,
    );
  }
}

export function hasWorkoutPatch(input: UpdateWorkoutInput): boolean {
  return (
    input.date !== undefined ||
    input.exercise !== undefined ||
    input.sets !== undefined ||
    input.restSeconds !== undefined ||
    input.note !== undefined
  );
}

export function nextRowNeedsDatePromotion(rows: unknown[][], deletedEntry: WorkoutEntry): boolean {
  const nextRow = rows[deletedEntry.rowNumber] ?? [];
  const nextExercise = normalizeExerciseName(nextRow[1]);
  const nextDateCell = String(nextRow[0] ?? "").trim();

  return Boolean(nextExercise && !nextDateCell);
}

function normalizeRow(row: unknown[]): Array<string | number> {
  return Array.from({ length: WORKOUT_COLUMN_COUNT }, (_, index) => {
    const value = row[index];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}
