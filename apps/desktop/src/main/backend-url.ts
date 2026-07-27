const LISTENING_URL =
  /\bAPI\s+listening\s+on\s+(https?:\/\/(?:\[[^\]]+\]|[^\s/:]+):\d+)\b/i;

export function parseBackendUrl(line: string): string | null {
  const match = line.match(LISTENING_URL);
  if (!match?.[1]) return null;

  try {
    const url = new URL(match[1]);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.port === "0") return null;
    if (
      url.hostname === "0.0.0.0" ||
      url.hostname === "::" ||
      url.hostname === "[::]"
    ) {
      url.hostname = "127.0.0.1";
    }
    return url.origin;
  } catch {
    return null;
  }
}

export class BackendUrlParser {
  private buffer = "";

  push(chunk: string): string | null {
    this.buffer = `${this.buffer}${chunk}`.slice(-4_000);
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseBackendUrl(line);
      if (parsed) {
        this.buffer = "";
        return parsed;
      }
    }
    return null;
  }
}
