import { randomUUID } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function nextId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
