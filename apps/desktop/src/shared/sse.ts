export interface ParsedSseEvent {
  event: string;
  data: unknown;
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

  push(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk;
    const events: ParsedSseEvent[] = [];
    let boundary = this.buffer.search(/\r?\n\r?\n/);

    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      const match = this.buffer.slice(boundary).match(/^\r?\n\r?\n/);
      this.buffer = this.buffer.slice(boundary + (match?.[0].length ?? 2));
      const parsed = parseSseBlock(block);
      if (parsed) events.push(parsed);
      boundary = this.buffer.search(/\r?\n\r?\n/);
    }

    return events;
  }

  finish(): ParsedSseEvent[] {
    const parsed = parseSseBlock(this.buffer);
    this.buffer = "";
    return parsed ? [parsed] : [];
  }
}
