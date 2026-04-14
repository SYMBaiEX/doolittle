export function parseDelimitedOptions(
  segments: string[],
  separator = ":",
): Record<string, string> {
  return segments.reduce<Record<string, string>>((accumulator, segment) => {
    const offset = segment.indexOf(separator);
    if (offset === -1) {
      return accumulator;
    }

    const key = segment.slice(0, offset).trim().toLowerCase();
    const value = segment.slice(offset + separator.length).trim();
    if (key && value) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

export function parseSegmentBody(raw: string):
  | {
      left: string;
      objective: string;
      segments: string[];
    }
  | undefined {
  const [left, objective] = raw.split("::").map((part) => part.trim());
  if (!left || !objective) {
    return undefined;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return undefined;
  }

  return {
    left,
    objective,
    segments,
  };
}
