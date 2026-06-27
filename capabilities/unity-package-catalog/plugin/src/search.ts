import type { PackageRecord, PackageSource } from "./types.ts";

export function searchPackageRecords(records: PackageRecord[], params: { query?: string; source?: PackageSource; limit?: number }) {
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 10)));
  const query = normalize(params.query ?? "");
  const tokens = query.split(" ").filter(Boolean);

  return records
    .filter((record) => !params.source || record.source === params.source)
    .map((record) => ({ record, score: tokens.length === 0 ? 1 : scoreRecord(record, tokens) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.record.name.localeCompare(right.record.name))
    .slice(0, limit);
}

export function scoreRecord(record: PackageRecord, tokens: string[]): number {
  const fields = weightedSearchFields(record);
  let score = 0;

  for (const token of tokens) {
    let tokenScore = 0;
    for (const field of fields) {
      if (field.text.includes(token)) {
        tokenScore = Math.max(tokenScore, field.weight);
      }
    }
    if (tokenScore === 0) {
      return 0;
    }
    score += tokenScore;
  }

  return score;
}

function weightedSearchFields(record: PackageRecord): Array<{ text: string; weight: number }> {
  const fields = [
    { text: normalize(record.name), weight: 8 },
    { text: normalize(record.keywords.join(" ")), weight: 5 },
    { text: normalize(record.description ?? ""), weight: 4 },
  ];

  if (record.source === "verdaccio") {
    fields.push({ text: normalize(record.readmePreview ?? ""), weight: 3 });
    fields.push({ text: normalize(record.versions.join(" ")), weight: 2 });
  } else {
    fields.push({ text: normalize(record.relativePath), weight: 5 });
    fields.push({ text: normalize(record.path), weight: 2 });
  }

  return fields;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@._/-]+/g, " ").replace(/\s+/g, " ").trim();
}

