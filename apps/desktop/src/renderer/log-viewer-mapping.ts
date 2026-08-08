import type { LogViewerStructuredEntry } from "@elizaos/ui/cloud-ui/components/log-viewer";
import { asRecord, asString } from "./lib";

/** Translates Doolittle's structured runtime events into the public UI viewer shape. */
export function toLogViewerEntries(
  logs: unknown[],
): LogViewerStructuredEntry[] {
  return logs.map((value, index) => {
    const entry = asRecord(value);
    const scope = asString(entry.scope, "runtime");
    const detail = asString(entry.detail);
    const message = asString(entry.message, "Event");
    const at = asString(entry.at);

    return {
      id: `${at}:${scope}:${message}:${index}`,
      timestamp: at || undefined,
      level: asString(entry.level, "info"),
      message,
      metadata: detail ? { scope, detail } : { scope },
    };
  });
}
