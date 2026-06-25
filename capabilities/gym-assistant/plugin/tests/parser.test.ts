import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { addExerciseAlias, EMPTY_ALIAS_STORE } from "../src/alias-store.ts";
import { parseCsv } from "../src/csv.ts";
import { resolveExercise, searchEntriesByCluster } from "../src/exercise-resolver.ts";
import {
  buildAppendRow,
  latestEntry,
  parseNumberCell,
  parseWorkoutRows,
  searchEntries,
} from "../src/parser.ts";

const fixturePath = new URL("./fixtures/gym-sample.csv", import.meta.url);

async function loadEntries() {
  const csv = await readFile(fixturePath, "utf8");
  return parseWorkoutRows(parseCsv(csv));
}

test("blank date cells inherit the previous date", async () => {
  const entries = await loadEntries();
  const bench = entries.find((entry) => entry.exercise === "Dumbbell Bench Press" && entry.rowNumber === 4);

  assert.equal(bench?.date, "2026-05-18");
});

test("comma decimal values parse as numbers", () => {
  assert.equal(parseNumberCell("12,5"), 12.5);
  assert.equal(parseNumberCell("12.5"), 12.5);
  assert.equal(parseNumberCell(12.5), 12.5);
});

test("exercise names are trimmed and matched case-insensitively", async () => {
  const entries = await loadEntries();
  const matches = searchEntries(entries, "dumbbell bench press", 10);

  assert.equal(matches.length, 3);
  assert.equal(matches[0].date, "2026-06-21");
  assert.equal(matches[0].exercise, "Dumbbell Bench Press");
});

test("latest entry returns newest matching workout", async () => {
  const entries = await loadEntries();
  const latest = latestEntry(entries, "Pull-ups");

  assert.equal(latest?.date, "2026-06-21");
  assert.deepEqual(latest?.sets, [
    { set: 1, reps: 9, weightKg: null },
    { set: 2, reps: 8, weightKg: null },
    { set: 3, reps: 5, weightKg: null },
  ]);
});

test("search returns newest first and respects limit", async () => {
  const entries = await loadEntries();
  const matches = searchEntries(entries, "Pull-ups", 2);

  assert.deepEqual(
    matches.map((entry) => entry.date),
    ["2026-06-21", "2026-05-21"],
  );
});

test("latest entry can be restricted to one date", async () => {
  const entries = await loadEntries();
  const latest = latestEntry(entries, "Pull-ups", "2026-05-18");

  assert.equal(latest?.date, "2026-05-18");
  assert.deepEqual(latest?.sets, [
    { set: 1, reps: 8, weightKg: null },
    { set: 2, reps: 7, weightKg: null },
    { set: 3, reps: 4, weightKg: null },
  ]);
});

test("known aliases resolve to one cluster and search all confirmed names", async () => {
  const entries = await loadEntries();
  const store = addExerciseAlias(EMPTY_ALIAS_STORE, {
    canonicalName: "Pull-ups",
    alias: "keo xa",
  });
  const resolution = resolveExercise("keo xa", entries, store);

  assert.equal(resolution.status, "resolved");

  if (resolution.status === "resolved") {
    const matches = searchEntriesByCluster(entries, resolution.cluster, 10);
    assert.deepEqual(
      matches.map((entry) => entry.date),
      ["2026-06-21", "2026-05-21", "2026-05-18"],
    );
  }
});

test("unknown aliases return candidates without silently choosing one", async () => {
  const entries = await loadEntries();
  const resolution = resolveExercise("keo xa", entries, EMPTY_ALIAS_STORE);

  assert.equal(resolution.status, "resolutionRequired");

  if (resolution.status === "resolutionRequired") {
    assert.ok(resolution.candidates.length > 0);
    assert.equal(resolution.candidates[0].exercise, "Pull-ups");
  }
});

test("append row builder writes 1-4 sets into the sheet shape", () => {
  const row = buildAppendRow({
    dateCell: "25/06/2026",
    exercise: " Pull-ups ",
    sets: [
      { set: 1, reps: 10, weightKg: null },
      { set: 2, reps: 8, weightKg: null },
      { set: 4, reps: 5, weightKg: 20 },
    ],
    restSeconds: 120,
    note: "test",
  });

  assert.deepEqual(row, ["25/06/2026", "Pull-ups", 10, "", 8, "", "", "", 5, 20, 120, "test"]);
});
