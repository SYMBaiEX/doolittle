export function collectErrorMessages(err: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "string") {
      messages.push(current);
      break;
    }
    if (current instanceof Error) {
      if (current.message) {
        messages.push(current.message);
      }
      if (current.stack) {
        messages.push(current.stack);
      }
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    if (typeof current === "object") {
      const maybeError = current as { message?: unknown; cause?: unknown };
      if (typeof maybeError.message === "string" && maybeError.message) {
        messages.push(maybeError.message);
      }
      if (maybeError.cause !== undefined) {
        current = maybeError.cause;
        continue;
      }
    }
    break;
  }

  return messages;
}

export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || String(err);
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
