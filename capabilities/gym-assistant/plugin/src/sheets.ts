import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AppendWorkoutInput, ResolvedGymConfig, WorkoutEntry } from "./types.ts";
import { buildAppendRow, formatSheetDate, parseWorkoutRows } from "./parser.ts";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

export async function readWorkoutRows(config: ResolvedGymConfig): Promise<unknown[][]> {
  const token = await getAccessToken(config.credentialsPath);
  const range = encodeURIComponent(`${config.sheetName}!A:L`);
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

