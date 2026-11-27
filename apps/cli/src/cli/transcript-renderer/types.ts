import type { CliTone } from "../activity-chrome";

export interface ResponseTranscriptEntry {
  label: string;
  body: string;
  at: string;
  elapsed?: string;
  kind?: "user" | "assistant" | "shell" | "command" | "system";
  tone?: CliTone;
  status?: "completed" | "failed" | "cancelled";
  pending?: boolean;
  /** Chronological tool/run activity owned by this turn. Renderers may fold
   * it for a viewport, but the durable entry retains every observed line. */
  toolTrace?: string[];
}
