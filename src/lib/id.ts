import { randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

/** ISO-8601 UTC, the format every timestamp column uses. */
export const nowIso = (): string => new Date().toISOString();
