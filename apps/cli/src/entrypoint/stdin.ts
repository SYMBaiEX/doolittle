export async function readEntrypointStdinText(
  stdin: AsyncIterable<string | Uint8Array> & { isTTY?: boolean },
): Promise<string> {
  if (stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > 1024 * 1024) throw new Error("Piped prompt exceeds 1 MiB.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}
