export type WorkoutSetNumber = 1 | 2 | 3 | 4;

export type WorkoutSet = {
  set: WorkoutSetNumber;
  reps: number | null;
  weightKg: number | null;
};

export type WorkoutEntry = {
  rowNumber: number;
  date: string;
  exercise: string;
  exerciseKey: string;
  sets: WorkoutSet[];
  restSeconds: number | null;
  note: string;
};

export type PlanSession = {
  index: number;
  id: string;
  name: string;
  exercises: string[];
};

export type TrainingPlan = {
  description: string;
  sessions: PlanSession[];
};

export type ClassifiedWorkoutSession = {
  date: string;
  session: PlanSession;
  matchedExercises: string[];
  performedExercises: string[];
  score: number;
};

export type PlanStatus = {
  today: string;
  plan: TrainingPlan;
  lastCompletedSession: ClassifiedWorkoutSession | null;
  nextSession: PlanSession | null;
  recentSessions: ClassifiedWorkoutSession[];
};

export type ExerciseAliasCluster = {
  id: string;
  canonicalName: string;
  aliases: string[];
};

export type ExerciseAliasStore = {
  version: 1;
  clusters: ExerciseAliasCluster[];
};

export type ExerciseResolveCandidate = {
  exercise: string;
  exerciseKey: string;
  count: number;
  lastDate: string;
  score: number;
};

export type ExerciseResolveResult =
  | {
      status: "resolved";
      query: string;
      cluster: ExerciseAliasCluster;
      source: "alias-store" | "exact-sheet-name";
      matchedAlias: string;
    }
  | {
      status: "resolutionRequired";
      query: string;
      candidates: ExerciseResolveCandidate[];
    };

export type GymPluginConfig = {
  spreadsheetId?: string;
  sheetName?: string;
  planSheetName?: string;
  credentialsPath?: string;
  defaultRestSeconds?: number;
  aliasStorePath?: string;
};

export type ResolvedGymConfig = {
  spreadsheetId: string;
  sheetName: string;
  planSheetName: string;
  credentialsPath: string;
  defaultRestSeconds: number;
  aliasStorePath: string;
};

export type AppendWorkoutInput = {
  date?: string;
  exercise: string;
  sets: WorkoutSet[];
  restSeconds?: number | null;
  note?: string;
};

export type AddExerciseAliasInput = {
  canonicalName: string;
  alias: string;
  id?: string;
};
