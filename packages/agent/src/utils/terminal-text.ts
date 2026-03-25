// biome-ignore lint/complexity/useRegexLiterals: Keeping terminal escape patterns explicit makes the filtering safer to maintain.
const ANSI_ESCAPE_PATTERN = new RegExp(
  "\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\))",
  "gu",
);
// biome-ignore lint/complexity/useRegexLiterals: String-backed regex avoids literal control-character escapes while keeping intent explicit.
const CONTROL_CHAR_PATTERN = new RegExp(
  "[\\u0000-\\u0008\\u000B-\\u001F\\u007F]",
  "gu",
);
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/gu;

function shortenUnbrokenTokens(text: string, maxTokenLength: number): string {
  return text.replace(/\S+/gu, (token) =>
    token.length > maxTokenLength
      ? `${token.slice(0, Math.max(0, maxTokenLength - 1))}…`
      : token,
  );
}

export function sanitizeTerminalText(
  text: string,
  options?: {
    preserveNewlines?: boolean;
    collapseWhitespace?: boolean;
    maxTokenLength?: number;
    maxLineLength?: number;
  },
): string {
  const preserveNewlines = options?.preserveNewlines ?? true;
  const collapseWhitespace = options?.collapseWhitespace ?? false;
  const maxTokenLength = options?.maxTokenLength ?? 160;
  const maxLineLength = options?.maxLineLength ?? 4_000;

  const cleaned = text
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n")
    .replace(BIDI_CONTROL_PATTERN, "")
    .replace(CONTROL_CHAR_PATTERN, "");

  const lines = cleaned
    .split("\n")
    .map((line) => shortenUnbrokenTokens(line, maxTokenLength))
    .map((line) =>
      collapseWhitespace
        ? line.replace(/\s+/gu, " ").trim()
        : line.trimEnd().slice(0, maxLineLength),
    )
    .filter(
      (line, index, array) => line.length > 0 || index < array.length - 1,
    );

  const joined = preserveNewlines ? lines.join("\n") : lines.join(" ");
  return collapseWhitespace
    ? joined.replace(/\s+/gu, " ").trim()
    : joined.trim();
}

export function sanitizeSingleLineTerminalText(text: string): string {
  return sanitizeTerminalText(text, {
    preserveNewlines: false,
    collapseWhitespace: true,
  });
}
