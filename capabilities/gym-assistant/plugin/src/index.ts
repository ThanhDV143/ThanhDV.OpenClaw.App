import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  gymAliasAdd,
  gymAliasList,
  gymConsistencyReport,
  gymLogAppend,
  gymLogDelete,
  gymLogFind,
  gymLogLatest,
  gymLogSearch,
  gymLogUpdate,
  gymPlanStatus,
  gymProgressReport,
} from "./tools.ts";

const WorkoutSetSchema = {
  type: "object",
  additionalProperties: false,
  required: ["set", "reps", "weightKg"],
  properties: {
    set: { enum: [1, 2, 3, 4] },
    reps: { type: ["number", "null"] },
    weightKg: { type: ["number", "null"] },
  },
};

const ConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    spreadsheetId: { type: "string", description: "Google Sheet spreadsheet ID." },
    sheetName: { type: "string", description: "Workout sheet/tab name." },
    planSheetName: { type: "string", description: "Training plan sheet/tab name." },
    credentialsPath: { type: "string", description: "Path to Google service account JSON." },
    defaultRestSeconds: { type: "number", description: "Default rest time in seconds." },
    aliasStorePath: { type: "string", description: "Path to persistent exercise alias memory JSON." },
  },
};

const AnalyticsPeriodSchema = { enum: ["day", "week", "month", "year", "all"] };
const AnalyticsRangeSchema = {
  type: "string",
  description: "Relative range such as 4w, 3m, 1y, or all. Defaults depend on the report.",
};

export default defineToolPlugin({
  id: "gym-assistant",
  name: "Gym Assistant",
  description: "Query and append to a Google Sheets workout journal.",
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: "gym_alias_list",
      label: "Gym Alias List",
      description: "List the persistent exercise alias memory used by gym lookup tools.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      execute: (params, config) => gymAliasList(params, config),
    }),
    tool({
      name: "gym_alias_add",
      label: "Gym Alias Add",
      description: "Add or confirm an exercise alias after the user confirms two names are the same exercise.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["canonicalName", "alias"],
        properties: {
          id: { type: "string", description: "Optional stable cluster ID. Defaults from canonicalName." },
          canonicalName: { type: "string", description: "Preferred display name for this exercise." },
          alias: { type: "string", description: "Additional user-facing name for the same exercise." },
        },
      },
      execute: (params, config) => gymAliasAdd(params, config),
    }),
    tool({
      name: "gym_plan_status",
      label: "Gym Plan Status",
      description: "Read the Plan sheet, classify recent workout days, and return the next planned session.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          today: { type: "string", description: "Optional ISO date yyyy-mm-dd. Defaults to today." },
          recentLimit: { type: "number", description: "Number of recent classified workout sessions to return." },
        },
      },
      execute: (params, config) => gymPlanStatus(params, config),
    }),
    tool({
      name: "gym_progress_report",
      label: "Gym Progress Report",
      description:
        "Calculate workout progress metrics and chat-compatible chart text from the Google Sheets log. Can target one resolved exercise or the whole log.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          exercise: { type: "string", description: "Optional exercise name or alias, for example Pull-ups or kéo xà." },
          period: AnalyticsPeriodSchema,
          range: AnalyticsRangeSchema,
          from: { type: "string", description: "Optional ISO start date yyyy-mm-dd. Overrides range start." },
          to: { type: "string", description: "Optional ISO end date yyyy-mm-dd. Defaults to the latest matching workout date." },
          chartMetric: {
            enum: ["sessionCount", "entryCount", "totalSets", "totalReps", "bestSetReps", "bestSetWeightKg", "estimatedVolumeKg"],
            description: "Metric rendered in chartText. Defaults to totalReps.",
          },
        },
      },
      execute: (params, config) => gymProgressReport(params, config),
    }),
    tool({
      name: "gym_consistency_report",
      label: "Gym Consistency Report",
      description:
        "Calculate workout consistency metrics, streaks, and chat-compatible chart text from the Google Sheets log.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          period: AnalyticsPeriodSchema,
          range: AnalyticsRangeSchema,
          from: { type: "string", description: "Optional ISO start date yyyy-mm-dd. Overrides range start." },
          to: { type: "string", description: "Optional ISO end date yyyy-mm-dd. Defaults to the latest workout date." },
          chartMetric: {
            enum: ["sessionCount", "entryCount", "totalSets", "totalReps"],
            description: "Metric rendered in chartText. Defaults to sessionCount.",
          },
        },
      },
      execute: (params, config) => gymConsistencyReport(params, config),
    }),
    tool({
      name: "gym_log_latest",
      label: "Gym Log Latest",
      description: "Return the latest workout log entry for a resolved exercise alias cluster. If unresolved, returns candidates instead of guessing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["exercise"],
        properties: {
          date: { type: "string", description: "Optional ISO date yyyy-mm-dd to restrict the lookup to one day." },
          exercise: { type: "string", description: "Exercise name, for example Pull-ups." },
        },
      },
      execute: (params, config) => gymLogLatest(params, config),
    }),
    tool({
      name: "gym_log_search",
      label: "Gym Log Search",
      description: "Search recent workout log entries for a resolved exercise alias cluster. If unresolved, returns candidates instead of guessing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["exercise"],
        properties: {
          date: { type: "string", description: "Optional ISO date yyyy-mm-dd to restrict the lookup to one day." },
          exercise: { type: "string", description: "Exercise name, for example Pull-ups." },
          limit: { type: "number", description: "Maximum number of entries to return." },
        },
      },
      execute: (params, config) => gymLogSearch(params, config),
    }),
    tool({
      name: "gym_log_append",
      label: "Gym Log Append",
      description: "Add one exercise row to the workout log in date order. If the date already exists, insert it at the end of that date block; if it falls between existing dates, insert it before the next date; otherwise append it to the sheet.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["exercise", "sets"],
        properties: {
          date: { type: "string", description: "ISO date yyyy-mm-dd. Defaults to today." },
          exercise: { type: "string", description: "Exercise name." },
          sets: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: WorkoutSetSchema,
          },
          restSeconds: { type: ["number", "null"] },
          note: { type: "string" },
        },
      },
      execute: (params, config) => gymLogAppend(params, config),
    }),
    tool({
      name: "gym_log_find",
      label: "Gym Log Find",
      description:
        "Find workout log candidates before an edit or delete. Returns row numbers and fingerprints that must be confirmed before applying changes.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string", description: "Optional ISO date yyyy-mm-dd to restrict candidates to one day." },
          exercise: { type: "string", description: "Optional exercise name or alias." },
          limit: { type: "number", description: "Maximum number of candidates to return." },
        },
      },
      execute: (params, config) => gymLogFind(params, config),
    }),
    tool({
      name: "gym_log_update",
      label: "Gym Log Update",
      description:
        "Update a confirmed workout log row. First use gym_log_find, show the exact row to the user, and wait for a separate explicit confirmation. Then pass rowNumber, expectedFingerprint, confirmed=true, and the user's confirmation text.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["rowNumber", "expectedFingerprint", "confirmed", "userConfirmation"],
        properties: {
          rowNumber: { type: "number", description: "Google Sheet row number from gym_log_find." },
          expectedFingerprint: { type: "string", description: "Fingerprint from gym_log_find for the exact row." },
          confirmed: { enum: [true], description: "Must be true only after the user confirms the exact row in a separate reply." },
          userConfirmation: { type: "string", minLength: 1, description: "Exact user confirmation text copied from the separate reply." },
          date: { type: "string", description: "Optional new ISO date yyyy-mm-dd." },
          exercise: { type: "string", description: "Optional new exercise name." },
          sets: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: WorkoutSetSchema,
            description: "Optional set patches. Only provided set numbers are changed.",
          },
          restSeconds: { type: ["number", "null"], description: "Optional new rest time in seconds." },
          note: { type: "string", description: "Optional new note." },
        },
      },
      execute: (params, config) => gymLogUpdate(params, config),
    }),
    tool({
      name: "gym_log_delete",
      label: "Gym Log Delete",
      description:
        "Delete a confirmed workout log row. First use gym_log_find, show the exact row to the user, and wait for a separate explicit confirmation. Then pass rowNumber, expectedFingerprint, confirmed=true, and the user's confirmation text.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["rowNumber", "expectedFingerprint", "confirmed", "userConfirmation"],
        properties: {
          rowNumber: { type: "number", description: "Google Sheet row number from gym_log_find." },
          expectedFingerprint: { type: "string", description: "Fingerprint from gym_log_find for the exact row." },
          confirmed: { enum: [true], description: "Must be true only after the user confirms the exact row in a separate reply." },
          userConfirmation: { type: "string", minLength: 1, description: "Exact user confirmation text copied from the separate reply." },
        },
      },
      execute: (params, config) => gymLogDelete(params, config),
    }),
  ],
});
