type StdoutWrite = (
  chunk: string,
  callback?: (error?: Error | null) => void,
) => boolean;

let ownedStdoutWrite: StdoutWrite | undefined;
let installed = false;

/**
 * Runtime activation uses shared libraries whose operational logs write directly
 * to stdout. A one-shot stdout contract (plain result text, one JSON document,
 * or NDJSON events) cannot tolerate those writes before, between, or after the
 * product output — including shutdown writes after the terminal event.
 *
 * The firewall therefore swallows every ordinary stdout write for the remaining
 * process lifetime. Product output must use `writeOwnedStdout`, which retains
 * the pre-firewall stream writer and remains the single owner of the channel.
 */
export function installMachineStdoutFirewall(): void {
  if (installed) return;
  installed = true;
  ownedStdoutWrite = process.stdout.write.bind(process.stdout) as StdoutWrite;

  process.stdout.write = ((
    _chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    const done = typeof encoding === "function" ? encoding : callback;
    if (done) queueMicrotask(done);
    return true;
  }) as typeof process.stdout.write;
}

/** Write product-owned stdout without being swallowed by the machine firewall. */
export function writeOwnedStdout(message: string): Promise<void> {
  const write =
    ownedStdoutWrite ??
    (process.stdout.write.bind(process.stdout) as StdoutWrite);
  return new Promise((resolve, reject) => {
    write(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
