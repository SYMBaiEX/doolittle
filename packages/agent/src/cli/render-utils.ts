import { stderr as errorOutput } from "node:process";

export {
  sanitizeSingleLineTerminalText,
  sanitizeTerminalText,
} from "@/utils/terminal-text";

export function escapeBlessed(text: string): string {
  return text.replaceAll("{", "\\{").replaceAll("}", "\\}");
}

export function restoreTerminalState(
  stream: NodeJS.WriteStream = errorOutput,
): void {
  try {
    stream.write("\x1b[0m\x1b[?25h\x1b[?2004l");
  } catch {
    // Best effort only.
  }
}
