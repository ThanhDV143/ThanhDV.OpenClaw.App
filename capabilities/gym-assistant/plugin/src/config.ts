import type { GymPluginConfig, ResolvedGymConfig } from "./types.ts";

export function resolveConfig(config: GymPluginConfig = {}, env: Record<string, string | undefined> = process.env): ResolvedGymConfig {
  const spreadsheetId = config.spreadsheetId ?? env.GYM_GOOGLE_SPREADSHEET_ID;
  const sheetName = config.sheetName ?? env.GYM_GOOGLE_SHEET_NAME ?? "Gym";
  const planSheetName = config.planSheetName ?? env.GYM_GOOGLE_PLAN_SHEET_NAME ?? "Plan";
  const credentialsPath = config.credentialsPath ?? env.GYM_GOOGLE_APPLICATION_CREDENTIALS;
  const defaultRestSeconds = config.defaultRestSeconds ?? parseEnvNumber(env.GYM_DEFAULT_REST_SECONDS) ?? 120;
  const aliasStorePath =
    config.aliasStorePath ??
    env.GYM_EXERCISE_ALIAS_PATH ??
    `${env.OPENCLAW_STATE_DIR ?? "/home/node/.openclaw"}/gym-assistant/exercise-aliases.json`;

  if (!spreadsheetId) {
    throw new Error("Missing gym spreadsheet ID. Set plugin config spreadsheetId or GYM_GOOGLE_SPREADSHEET_ID.");
  }

  if (!credentialsPath) {
    throw new Error("Missing Google credentials path. Set plugin config credentialsPath or GYM_GOOGLE_APPLICATION_CREDENTIALS.");
  }

  return {
    spreadsheetId,
    sheetName,
    planSheetName,
    credentialsPath,
    defaultRestSeconds,
    aliasStorePath,
  };
}

function parseEnvNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
