export interface ParsedSseEvent {
  event: string;
  data: unknown;
}

export const MAX_SSE_BUFFER_CHARS = 2_000_000;
export const MAX_SSE_EVENT_CHARS = 512_000;

export interface SseParserOptions {
  maxBufferChars?: number;
  maxEventChars?: number;
}

export function parseSseBlock(block: string): ParsedSseEvent | null {
  let event = "message";
  const data: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separator = rawLine.indexOf(":");
    const field = separator === -1 ? rawLine : rawLine.slice(0, separator);
    let value = separator === -1 ? "" : rawLine.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }

  if (data.length === 0) return null;
  const rawData = data.join("\n");
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
}

export class SseParser {
  private buffer = "";

  private readonly maxBufferChars: number;

  private readonly maxEventChars: number;

  constructor(options: SseParserOptions = {}) {
    this.maxBufferChars = options.maxBufferChars ?? MAX_SSE_BUFFER_CHARS;
    this.maxEventChars = options.maxEventChars ?? MAX_SSE_EVENT_CHARS;
  }

  push(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk;
    const events: ParsedSseEvent[] = [];
    let boundary = this.buffer.search(/\r?\n\r?\n/);

    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.assertEventSize(block.length);
      const match = this.buffer.slice(boundary).match(/^\r?\n\r?\n/);
      this.buffer = this.buffer.slice(boundary + (match?.[0].length ?? 2));
      const parsed = parseSseBlock(block);
      if (parsed) events.push(parsed);
      boundary = this.buffer.search(/\r?\n\r?\n/);
    }

    this.assertBufferSize();

    return events;
  }

  finish(): ParsedSseEvent[] {
    this.assertBufferSize();
    this.assertEventSize(this.buffer.length);
    const parsed = parseSseBlock(this.buffer);
    this.buffer = "";
    return parsed ? [parsed] : [];
  }

  private assertBufferSize(): void {
    if (this.buffer.length > this.maxBufferChars) {
      throw new Error(
        `SSE stream buffer exceeds the ${this.maxBufferChars.toLocaleString()} character limit.`,
      );
    }
  }

  private assertEventSize(length: number): void {
    if (length > this.maxEventChars) {
      throw new Error(
        `SSE stream event exceeds the ${this.maxEventChars.toLocaleString()} character limit.`,
      );
    }
  }
}
