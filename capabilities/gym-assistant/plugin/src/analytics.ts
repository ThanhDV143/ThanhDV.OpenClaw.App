import type { WorkoutEntry } from "./types.ts";

export type AnalyticsPeriod = "day" | "week" | "month" | "year" | "all";
export type ProgressMetric =
  | "sessionCount"
  | "entryCount"
  | "totalSets"
  | "totalReps"
  | "bestSetReps"
  | "bestSetWeightKg"
  | "estimatedVolumeKg";
export type ConsistencyMetric = "sessionCount" | "entryCount" | "totalSets" | "totalReps";

type DateRangeInput = {
  period?: AnalyticsPeriod;
  range?: string;
  from?: string;
  to?: string;
};

type ChartSpec = {
  type: "bar";
  x: "period";
  y: string;
  title: string;
};

type BucketMetrics = {
  sessionCount: number;
  entryCount: number;
  totalSets: number;
  totalReps: number;
  bestSetReps: number | null;
  bestSetWeightKg: number | null;
  estimatedVolumeKg: number;
};

type AnalyticsBucket = {
  period: string;
  startDate: string;
  endDate: string;
  metrics: BucketMetrics;
};

export type ProgressReportInput = DateRangeInput & {
  exercise?: string;
  chartMetric?: ProgressMetric;
};

export type ProgressReport = {
  query: Required<Pick<ProgressReportInput, "period" | "range" | "chartMetric">> &
    Pick<ProgressReportInput, "exercise" | "from" | "to">;
  summary: BucketMetrics & {
    from: string | null;
    to: string | null;
    exercise: string | null;
  };
  series: AnalyticsBucket[];
  chartSpec: ChartSpec;
  chartText: string;
  insights: string[];
  notices: string[];
};

export type ConsistencyReportInput = DateRangeInput & {
  chartMetric?: ConsistencyMetric;
};

export type ConsistencyReport = {
  query: Required<Pick<ConsistencyReportInput, "period" | "range" | "chartMetric">> &
    Pick<ConsistencyReportInput, "from" | "to">;
  summary: {
    from: string | null;
    to: string | null;
    workoutDays: number;
    entryCount: number;
    totalSets: number;
    totalReps: number;
    currentStreakDays: number;
    longestStreakDays: number;
    averageWorkoutDaysPerWeek: number;
    lastWorkoutDate: string | null;
  };
  series: Array<{
    period: string;
    startDate: string;
    endDate: string;
    metrics: Pick<BucketMetrics, "sessionCount" | "entryCount" | "totalSets" | "totalReps">;
  }>;
  chartSpec: ChartSpec;
  chartText: string;
  insights: string[];
  notices: string[];
};

export function buildProgressReport(entries: WorkoutEntry[], input: ProgressReportInput = {}): ProgressReport {
  const period = input.period ?? "week";
  const range = input.range ?? "3m";
  const chartMetric = input.chartMetric ?? "totalReps";
  const { scopedEntries, from, to } = scopeEntries(entries, { ...input, period, range });
  const series = buildBuckets(scopedEntries, period, from, to);
  const summaryMetrics = aggregateEntries(scopedEntries);
  const title = `${input.exercise ?? "Workout"} ${chartMetric} by ${period}`;

  return {
    query: {
      exercise: input.exercise,
      period,
      range,
      from: input.from,
      to: input.to,
      chartMetric,
    },
    summary: {
      from,
      to,
      exercise: input.exercise ?? null,
      ...summaryMetrics,
    },
    series,
    chartSpec: {
      type: "bar",
      x: "period",
      y: chartMetric,
      title,
    },
    chartText: renderBarChart(series, chartMetric, title),
    insights: progressInsights(series, chartMetric),
    notices: progressNotices(scopedEntries),
  };
}

export function buildConsistencyReport(entries: WorkoutEntry[], input: ConsistencyReportInput = {}): ConsistencyReport {
  const period = input.period ?? "week";
  const range = input.range ?? "6m";
  const chartMetric = input.chartMetric ?? "sessionCount";
  const { scopedEntries, from, to } = scopeEntries(entries, { ...input, period, range });
  const series = buildBuckets(scopedEntries, period, from, to).map((bucket) => ({
    period: bucket.period,
    startDate: bucket.startDate,
    endDate: bucket.endDate,
    metrics: {
      sessionCount: bucket.metrics.sessionCount,
      entryCount: bucket.metrics.entryCount,
      totalSets: bucket.metrics.totalSets,
      totalReps: bucket.metrics.totalReps,
    },
  }));
  const summaryMetrics = aggregateEntries(scopedEntries);
  const workoutDates = uniqueSortedDates(scopedEntries);
  const title = `Workout ${chartMetric} by ${period}`;

  return {
    query: {
      period,
      range,
      from: input.from,
      to: input.to,
      chartMetric,
    },
    summary: {
      from,
      to,
      workoutDays: workoutDates.length,
      entryCount: summaryMetrics.entryCount,
      totalSets: summaryMetrics.totalSets,
      totalReps: summaryMetrics.totalReps,
      currentStreakDays: currentStreak(workoutDates),
      longestStreakDays: longestStreak(workoutDates),
      averageWorkoutDaysPerWeek: averageWorkoutDaysPerWeek(workoutDates, from, to),
      lastWorkoutDate: workoutDates.at(-1) ?? null,
    },
    series,
    chartSpec: {
      type: "bar",
      x: "period",
      y: chartMetric,
      title,
    },
    chartText: renderBarChart(series, chartMetric, title),
    insights: consistencyInsights(series, workoutDates),
    notices: [],
  };
}

function scopeEntries(
  entries: WorkoutEntry[],
  input: Required<Pick<DateRangeInput, "period" | "range">> & Pick<DateRangeInput, "from" | "to">,
): { scopedEntries: WorkoutEntry[]; from: string | null; to: string | null } {
  if (entries.length === 0) {
    return { scopedEntries: [], from: input.from ?? null, to: input.to ?? null };
  }

  const sorted = entries.slice().sort((left, right) => left.date.localeCompare(right.date));
  const latestDate = input.to ?? sorted.at(-1)?.date ?? null;
  const earliestDate = input.from ?? sorted[0]?.date ?? null;
  if (!latestDate || !earliestDate) {
    return { scopedEntries: [], from: null, to: null };
  }

  const from = input.from ?? rangeStart(latestDate, input.range);
  const to = latestDate;
  const safeFrom = input.range === "all" && !input.from ? earliestDate : from;
  const scopedEntries = sorted.filter((entry) => entry.date >= safeFrom && entry.date <= to);

  return { scopedEntries, from: safeFrom, to };
}

function buildBuckets(entries: WorkoutEntry[], period: AnalyticsPeriod, from: string | null, to: string | null): AnalyticsBucket[] {
  if (!from || !to) {
    return [];
  }
  if (period === "all") {
    return [
      {
        period: "all",
        startDate: from,
        endDate: to,
        metrics: aggregateEntries(entries),
      },
    ];
  }

  const buckets: AnalyticsBucket[] = [];
  let cursor = periodStart(from, period);
  const end = parseIsoDate(to);

  while (cursor <= end) {
    const startDate = formatIsoDate(cursor);
    const next = nextPeriodStart(cursor, period);
    const endDate = formatIsoDate(addDays(next, -1));
    const bucketEntries = entries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
    buckets.push({
      period: periodLabel(cursor, period),
      startDate,
      endDate,
      metrics: aggregateEntries(bucketEntries),
    });
    cursor = next;
  }

  return buckets;
}

function aggregateEntries(entries: WorkoutEntry[]): BucketMetrics {
  let totalSets = 0;
  let totalReps = 0;
  let bestSetReps: number | null = null;
  let bestSetWeightKg: number | null = null;
  let estimatedVolumeKg = 0;

  for (const entry of entries) {
    for (const set of entry.sets) {
      totalSets += 1;
      if (set.reps !== null) {
        totalReps += set.reps;
        bestSetReps = bestSetReps === null ? set.reps : Math.max(bestSetReps, set.reps);
      }
      if (set.weightKg !== null) {
        bestSetWeightKg = bestSetWeightKg === null ? set.weightKg : Math.max(bestSetWeightKg, set.weightKg);
      }
      if (set.reps !== null && set.weightKg !== null) {
        estimatedVolumeKg += set.reps * set.weightKg;
      }
    }
  }

  return {
    sessionCount: uniqueSortedDates(entries).length,
    entryCount: entries.length,
    totalSets,
    totalReps,
    bestSetReps,
    bestSetWeightKg,
    estimatedVolumeKg: roundMetric(estimatedVolumeKg),
  };
}

function renderBarChart(
  series: Array<{ period: string; metrics: Record<string, number | null> }>,
  metric: string,
  title: string,
): string {
  if (series.length === 0) {
    return `${title}\n(no data)`;
  }

  const values = series.map((bucket) => Number(bucket.metrics[metric] ?? 0));
  const max = Math.max(...values, 0);
  const labelWidth = Math.min(14, Math.max(6, ...series.map((bucket) => bucket.period.length)));
  const lines = [title];

  for (const bucket of series) {
    const value = Number(bucket.metrics[metric] ?? 0);
    const barLength = max > 0 ? Math.max(1, Math.round((value / max) * 18)) : 0;
    const bar = barLength > 0 ? "#".repeat(barLength) : "";
    lines.push(`${bucket.period.padEnd(labelWidth)} | ${bar.padEnd(18)} ${formatMetric(value)}`);
  }

  return lines.join("\n");
}

function progressInsights(series: AnalyticsBucket[], metric: ProgressMetric): string[] {
  const nonEmpty = series.filter((bucket) => Number(bucket.metrics[metric] ?? 0) > 0);
  if (nonEmpty.length === 0) {
    return ["No matching workout data in the selected range."];
  }

  const best = nonEmpty.reduce((currentBest, bucket) =>
    Number(bucket.metrics[metric] ?? 0) > Number(currentBest.metrics[metric] ?? 0) ? bucket : currentBest,
  );
  const first = nonEmpty[0];
  const last = nonEmpty.at(-1) ?? first;
  const firstValue = Number(first.metrics[metric] ?? 0);
  const lastValue = Number(last.metrics[metric] ?? 0);
  const direction = lastValue > firstValue ? "up" : lastValue < firstValue ? "down" : "flat";

  return [
    `Best ${metric}: ${formatMetric(Number(best.metrics[metric] ?? 0))} in ${best.period}.`,
    `Trend from ${first.period} to ${last.period}: ${direction}.`,
  ];
}

function consistencyInsights(
  series: Array<{ period: string; metrics: Pick<BucketMetrics, "sessionCount" | "entryCount" | "totalSets" | "totalReps"> }>,
  workoutDates: string[],
): string[] {
  const activeBuckets = series.filter((bucket) => bucket.metrics.sessionCount > 0);
  if (activeBuckets.length === 0) {
    return ["No workout days in the selected range."];
  }

  const best = activeBuckets.reduce((currentBest, bucket) =>
    bucket.metrics.sessionCount > currentBest.metrics.sessionCount ? bucket : currentBest,
  );

  return [
    `Most consistent period: ${best.period} with ${best.metrics.sessionCount} workout day(s).`,
    `Last workout date: ${workoutDates.at(-1) ?? "none"}.`,
  ];
}

function progressNotices(entries: WorkoutEntry[]): string[] {
  const hasWeightedSets = entries.some((entry) => entry.sets.some((set) => set.weightKg !== null));
  const hasUnweightedSets = entries.some((entry) => entry.sets.some((set) => set.reps !== null && set.weightKg === null));
  if (hasWeightedSets && hasUnweightedSets) {
    return ["estimatedVolumeKg only counts sets that have both reps and weightKg; bodyweight is not inferred."];
  }
  if (!hasWeightedSets && hasUnweightedSets) {
    return ["estimatedVolumeKg is 0 because logged sets do not include weightKg/bodyweight."];
  }
  return [];
}

function uniqueSortedDates(entries: WorkoutEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.date))].sort();
}

function currentStreak(dates: string[]): number {
  if (dates.length === 0) {
    return 0;
  }

  let streak = 1;
  let cursor = parseIsoDate(dates.at(-1) ?? dates[0]);
  for (let index = dates.length - 2; index >= 0; index -= 1) {
    cursor = addDays(cursor, -1);
    if (dates[index] !== formatIsoDate(cursor)) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function longestStreak(dates: string[]): number {
  if (dates.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const previous = parseIsoDate(dates[index - 1]);
    const expected = formatIsoDate(addDays(previous, 1));
    if (dates[index] === expected) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function averageWorkoutDaysPerWeek(dates: string[], from: string | null, to: string | null): number {
  if (dates.length === 0 || !from || !to) {
    return 0;
  }
  const days = Math.max(1, daysBetween(parseIsoDate(from), parseIsoDate(to)) + 1);
  return roundMetric(dates.length / (days / 7));
}

function rangeStart(to: string, range: string): string {
  if (range === "all") {
    return "0001-01-01";
  }

  const match = /^(\d+)([dwmy])$/.exec(range);
  if (!match) {
    return rangeStart(to, "3m");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const end = parseIsoDate(to);
  if (unit === "d") {
    return formatIsoDate(addDays(end, -amount + 1));
  }
  if (unit === "w") {
    return formatIsoDate(addDays(end, -amount * 7 + 1));
  }
  if (unit === "m") {
    return formatIsoDate(addMonths(end, -amount));
  }
  return formatIsoDate(addMonths(end, -amount * 12));
}

function periodStart(isoDate: string, period: AnalyticsPeriod): Date {
  const date = parseIsoDate(isoDate);
  if (period === "day") {
    return date;
  }
  if (period === "week") {
    const day = date.getUTCDay() || 7;
    return addDays(date, 1 - day);
  }
  if (period === "month") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function nextPeriodStart(date: Date, period: Exclude<AnalyticsPeriod, "all">): Date {
  if (period === "day") {
    return addDays(date, 1);
  }
  if (period === "week") {
    return addDays(date, 7);
  }
  if (period === "month") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }
  return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
}

function periodLabel(date: Date, period: Exclude<AnalyticsPeriod, "all">): string {
  if (period === "day") {
    return formatIsoDate(date);
  }
  if (period === "week") {
    return isoWeekLabel(date);
  }
  if (period === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return String(date.getUTCFullYear());
}

function isoWeekLabel(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Expected ISO date yyyy-mm-dd, got: ${value}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86400000);
}

function addMonths(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate()));
}

function daysBetween(left: Date, right: Date): number {
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
