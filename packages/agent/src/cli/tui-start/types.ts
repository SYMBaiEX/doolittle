export interface StartCliOptions {
  onReady?: () => void;
  bootLogs?: Array<{
    source: "stdout" | "stderr";
    text: string;
  }>;
}
