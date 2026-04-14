import { existsSync } from "node:fs";
import { readJsonlTail } from "@doolittle/logger";
import type { AppLogRecord } from "@/logging/logger";

export function readLoggerServiceRecords(
  eventLogPath: string,
  limit = 100,
): AppLogRecord[] {
  if (!existsSync(eventLogPath)) {
    return [];
  }

  return readJsonlTail(eventLogPath, limit, ["event"]);
}
