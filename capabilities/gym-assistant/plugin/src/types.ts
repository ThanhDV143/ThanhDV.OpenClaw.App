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

export type GymPluginConfig = {
  spreadsheetId?: string;
  sheetName?: string;
  credentialsPath?: string;
  defaultRestSeconds?: number;
};

export type ResolvedGymConfig = {
  spreadsheetId: string;
  sheetName: string;
  credentialsPath: string;
  defaultRestSeconds: number;
};

export type AppendWorkoutInput = {
  date?: string;
  exercise: string;
  sets: WorkoutSet[];
  restSeconds?: number | null;
  note?: string;
};

