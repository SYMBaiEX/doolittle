export function parseRequestError(response: Response): Promise<string> {
  return response.text().then((text) => {
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      return typeof parsed.error === "string"
        ? parsed.error
        : `${response.status}: ${text || response.statusText}`;
    } catch {
      const trimmed = text.trim();
      if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
        return `${response.status}: The local runtime returned an unexpected service error.`;
      }
      return trimmed || `${response.status}: ${response.statusText}`;
    }
  });
}

export async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error("The local runtime response is too large.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("The local runtime response is too large.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
