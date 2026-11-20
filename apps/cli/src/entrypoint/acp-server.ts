import { Readable } from "node:stream";
import { ndJsonStream } from "@doolittle/acp";
import { getApplicationSession } from "@doolittle/agent/runtime/application";
import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";

/** ACP owns stdout; this adapter owns stdio and the application's process lifetime. */
export async function startAcpServer(): Promise<void> {
  const application = getApplicationSession();
  const writeProtocolBytes = process.stdout.write.bind(process.stdout);
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = process.stderr.write.bind(
    process.stderr,
  ) as typeof process.stdout.write;
  const protocolOutput = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        writeProtocolBytes(chunk, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  });
  const close = (reason: string) => application.dispose(reason, { fast: true });
  const lifecycle = installRuntimeProcessLifecycle({ label: "ACP", close });

  try {
    if (lifecycle.closing) return await lifecycle.closing;
    let connectionFailure: { error: unknown } | undefined;
    try {
      const stream = ndJsonStream(
        protocolOutput,
        Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
      );
      const connection = application.services.acp.agentApp().connect(stream);
      await connection.closed;
    } catch (error) {
      connectionFailure = { error };
    }

    if (lifecycle.closing) return await lifecycle.closing;
    try {
      await close("ACP connection closed");
    } catch (error) {
      if (!connectionFailure) throw error;
      throw new AggregateError(
        [connectionFailure.error, error],
        "ACP connection and application shutdown failed.",
      );
    }
    if (connectionFailure) throw connectionFailure.error;
  } finally {
    lifecycle.dispose();
    process.stdout.write = originalStdoutWrite;
  }
}
