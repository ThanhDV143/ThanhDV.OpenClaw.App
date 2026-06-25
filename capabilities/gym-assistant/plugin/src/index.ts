import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { gymLogAppend, gymLogLatest, gymLogSearch } from "./tools.ts";

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
    credentialsPath: { type: "string", description: "Path to Google service account JSON." },
    defaultRestSeconds: { type: "number", description: "Default rest time in seconds." },
  },
};

export default defineToolPlugin({
  id: "gym-assistant",
  name: "Gym Assistant",
  description: "Query and append to a Google Sheets workout journal.",
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: "gym_log_latest",
      label: "Gym Log Latest",
      description: "Return the latest workout log entry for an exercise.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["exercise"],
        properties: {
          exercise: { type: "string", description: "Exercise name, for example Pull-ups." },
        },
      },
      execute: (params, config) => gymLogLatest(params, config),
    }),
    tool({
      name: "gym_log_search",
      label: "Gym Log Search",
      description: "Search recent workout log entries for an exercise.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["exercise"],
        properties: {
          exercise: { type: "string", description: "Exercise name, for example Pull-ups." },
          limit: { type: "number", description: "Maximum number of entries to return." },
        },
      },
      execute: (params, config) => gymLogSearch(params, config),
    }),
    tool({
      name: "gym_log_append",
      label: "Gym Log Append",
      description: "Append one exercise row to the workout log.",
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
  ],
});
