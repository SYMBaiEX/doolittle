import type { CliStartMode } from "./mode";

export interface StartCliOptions {
  mode?: CliStartMode;
  onReady?: () => void;
  bootLogs?: Array<{
    source: "stdout" | "stderr";
    text: string;
  }>;
}
