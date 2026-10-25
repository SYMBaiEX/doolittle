export interface ResponseTranscriptEntry {
  label: string;
  body: string;
  at: string;
  elapsed?: string;
  kind?: "user" | "assistant" | "shell" | "command" | "system";
  pending?: boolean;
  liveActivity?: string[];
}
