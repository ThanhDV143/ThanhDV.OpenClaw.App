import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AppendWorkoutInput, DeleteWorkoutInput, ResolvedGymConfig, UpdateWorkoutInput, WorkoutEntry } from "./types.ts";
import {
  assertConfirmed,
  assertEditableRow,
  assertFingerprintMatches,
  buildUpdatedWorkoutRow,
  hasWorkoutPatch,
  nextRowNeedsDatePromotion,
} from "./edits.ts";
import { buildAppendRow, formatSheetDate, parseWorkoutRows } from "./parser.ts";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

type SpreadsheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

export async function readWorkoutRows(config: ResolvedGymConfig): Promise<unknown[][]> {
  return readSheetRows(config, config.sheetName, "A:L");
}

export async function readPlanRows(config: ResolvedGymConfig): Promise<unknown[][]> {
  return readSheetRows(config, config.planSheetName, "A:Z");
}

async function readSheetRows(config: ResolvedGymConfig, sheetName: string, columns: string): Promise<unknown[][]> {
  const token = await getAccessToken(config.credentialsPath);
  const range = encodeURIComponent(`${sheetName}!${columns}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets read failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { values?: unknown[][] };
  return data.values ?? [];
}

export async function appendWorkoutEntry(config: ResolvedGymConfig, input: AppendWorkoutInput): Promise<{ entry: WorkoutEntry; row: Array<string | number> }> {
  const rows = await readWorkoutRows(config);
  const entries = parseWorkoutRows(rows);
  const isoDate = input.date ?? todayIsoDate();
  const dateCell = shouldWriteDateCell(entries, isoDate) ? formatSheetDate(isoDate) : "";
  const row = buildAppendRow({
    dateCell,
    exercise: input.exercise,
    sets: input.sets,
    restSeconds: input.restSeconds ?? config.defaultRestSeconds,
    note: input.note ?? "",
  });

  const token = await getAccessToken(config.credentialsPath);
  const range = encodeURIComponent(`${config.sheetName}!A:L`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      values: [row],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Sheets append failed: ${response.status} ${await response.text()}`);
  }

  const rowNumber = rows.length + 1;
  const parsed = parseWorkoutRows([...rows, row]);
  const entry = parsed.find((candidate) => candidate.rowNumber === rowNumber);
  if (!entry) {
    throw new Error("Append succeeded but appended row could not be parsed.");
  }

  return { entry, row };
}

export async function updateWorkoutEntry(
  config: ResolvedGymConfig,
  input: UpdateWorkoutInput,
): Promise<{ updated: true; before: WorkoutEntry; after: WorkoutEntry; row: Array<string | number> }> {
  assertConfirmed(input);
  if (!hasWorkoutPatch(input)) {
    throw new Error("Update request must include at least one field to change.");
  }

  const rows = await readWorkoutRows(config);
  assertEditableRow(input.rowNumber, rows);
  const currentRow = rows[input.rowNumber - 1] ?? [];
  assertFingerprintMatches(input.rowNumber, currentRow, input.expectedFingerprint);

  const before = parseWorkoutRows(rows).find((entry) => entry.rowNumber === input.rowNumber);
  if (!before) {
    throw new Error(`Workout row ${input.rowNumber} is not a parsed workout entry.`);
  }
  if (input.date !== undefined && nextRowNeedsDatePromotion(rows, before)) {
    throw new Error(
      `Changing date on row ${input.rowNumber} would also affect following blank-date workout rows. Edit the date in Google Sheets manually or split the workout day first.`,
    );
  }

  const row = buildUpdatedWorkoutRow(currentRow, input);
  await writeWorkoutRow(config, input.rowNumber, row);

  const nextRows = rows.slice();
  nextRows[input.rowNumber - 1] = row;
  const after = parseWorkoutRows(nextRows).find((entry) => entry.rowNumber === input.rowNumber);
  if (!after) {
    throw new Error(`Workout row ${input.rowNumber} was updated but could not be parsed.`);
  }

  return { updated: true, before, after, row };
}

export async function deleteWorkoutEntry(
  config: ResolvedGymConfig,
  input: DeleteWorkoutInput,
): Promise<{ deleted: true; deletedEntry: WorkoutEntry; promotedDateToNextRow: boolean }> {
  assertConfirmed(input);
  const rows = await readWorkoutRows(config);
  assertEditableRow(input.rowNumber, rows);
  const currentRow = rows[input.rowNumber - 1] ?? [];
  assertFingerprintMatches(input.rowNumber, currentRow, input.expectedFingerprint);

  const deletedEntry = parseWorkoutRows(rows).find((entry) => entry.rowNumber === input.rowNumber);
  if (!deletedEntry) {
    throw new Error(`Workout row ${input.rowNumber} is not a parsed workout entry.`);
  }

  const currentDateCell = String(currentRow[0] ?? "").trim();
  const promotedDateToNextRow = Boolean(currentDateCell && nextRowNeedsDatePromotion(rows, deletedEntry));
  if (promotedDateToNextRow) {
    await writeWorkoutCell(config, input.rowNumber + 1, "A", formatSheetDate(deletedEntry.date));
  }

  await deleteSheetRow(config, input.rowNumber);

  return { deleted: true, deletedEntry, promotedDateToNextRow };
}

async function getAccessToken(credentialsPath: string): Promise<string> {
  const credentials = JSON.parse(await readFile(credentialsPath, "utf8")) as ServiceAccountCredentials;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claim = base64UrlJson({
    iss: credentials.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  });
  const unsignedJwt = `${header}.${claim}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsignedJwt), createPrivateKey(credentials.private_key));
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google auth failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google auth response did not include access_token.");
  }

  return data.access_token;
}

async function writeWorkoutRow(config: ResolvedGymConfig, rowNumber: number, row: Array<string | number>): Promise<void> {
  const range = `${config.sheetName}!A${rowNumber}:L${rowNumber}`;
  await updateSheetValues(config, range, [row]);
}

async function writeWorkoutCell(config: ResolvedGymConfig, rowNumber: number, column: string, value: string | number): Promise<void> {
  const range = `${config.sheetName}!${column}${rowNumber}:${column}${rowNumber}`;
  await updateSheetValues(config, range, [[value]]);
}

async function updateSheetValues(config: ResolvedGymConfig, range: string, values: Array<Array<string | number>>): Promise<void> {
  const token = await getAccessToken(config.credentialsPath);
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      values,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Sheets update failed: ${response.status} ${await response.text()}`);
  }
}

async function deleteSheetRow(config: ResolvedGymConfig, rowNumber: number): Promise<void> {
  const token = await getAccessToken(config.credentialsPath);
  const sheetId = await getSheetId(config, token);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}:batchUpdate`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Sheets delete row failed: ${response.status} ${await response.text()}`);
  }
}

async function getSheetId(config: ResolvedGymConfig, token: string): Promise<number> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?fields=sheets.properties(sheetId,title)`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets metadata read failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as SpreadsheetMetadata;
  const sheetId = data.sheets?.find((sheet) => sheet.properties?.title === config.sheetName)?.properties?.sheetId;
  if (sheetId === undefined) {
    throw new Error(`Google Sheet tab not found: ${config.sheetName}`);
  }

  return sheetId;
}

function shouldWriteDateCell(entries: WorkoutEntry[], isoDate: string): boolean {
  return entries.at(-1)?.date !== isoDate;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
