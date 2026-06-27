import { createHash } from "node:crypto";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function previewText(value: unknown, maxLength = 1200): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

