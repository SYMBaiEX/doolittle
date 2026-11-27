import { stderr as errorOutput } from "node:process";

export {
  sanitizeSingleLineTerminalText,
  sanitizeTerminalText,
} from "@doolittle/agent/utils/terminal-text";

export function escapeBlessed(text: string): string {
  // Blessed's canonical literal-brace tokens round-trip through its tag
  // parser without leaving visible backslashes behind.
  return text.replace(/[{}]/gu, (char) =>
    char === "{" ? "{open}" : "{close}",
  );
}

export function restoreTerminalState(
  stream: NodeJS.WriteStream = errorOutput,
): void {
  if (!stream.isTTY) return;
  try {
    stream.write("\x1b[0m\x1b[?25h\x1b[?2004l");
  } catch {
    // Best effort only.
  }
}
