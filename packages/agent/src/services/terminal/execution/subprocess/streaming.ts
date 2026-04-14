export async function readProcessStream(
  stream: ReadableStream<Uint8Array> | null,
  options: {
    onChunk?: (chunk: string) => void;
    collect?: (chunk: string) => void;
  } = {},
): Promise<void> {
  if (!stream) {
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
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
  } finally {
    reader.releaseLock();
  }
}
