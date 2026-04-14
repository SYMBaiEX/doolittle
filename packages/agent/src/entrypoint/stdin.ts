export async function readEntrypointStdinText(
  stdin: AsyncIterable<string | Uint8Array> & { isTTY?: boolean },
): Promise<string> {
  if (stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
