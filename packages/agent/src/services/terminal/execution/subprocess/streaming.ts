export async function readProcessStream(
  stream: AsyncIterable<Uint8Array | string> | null,
  options: {
    onChunk?: (chunk: string) => void;
    collect?: (chunk: string) => void;
  } = {},
): Promise<void> {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  for await (const value of stream) {
    const chunk =
      typeof value === "string"
        ? value
        : decoder.decode(value, { stream: true });
    if (!chunk) {
      continue;
    }

    options.collect?.(chunk);
    options.onChunk?.(chunk);
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    options.collect?.(finalChunk);
    options.onChunk?.(finalChunk);
  }
}
