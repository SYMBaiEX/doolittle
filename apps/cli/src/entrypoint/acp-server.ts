import { Readable } from "node:stream";
import { ndJsonStream } from "@doolittle/acp";
import { getApplicationSession } from "@doolittle/agent/runtime/application";

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
  const shutdown = (signal: "SIGINT" | "SIGTERM" | "disconnect") => {
    void application.dispose(`ACP received ${signal}`, { fast: true }).then(
      () => process.exit(
        signal === "SIGINT" ? 130 : signal === "disconnect" ? 1 : 0,
      ),
      (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        process.stderr.write(`ACP shutdown failed: ${detail}\n`);
        process.exit(1);
      },
    );
  };
  const onSigint = () => shutdown("SIGINT");
  const onSigterm = () => shutdown("SIGTERM");
  const onDisconnect = () => shutdown("disconnect");
  const watchHostDisconnect =
    process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
    typeof process.send === "function";
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  if (watchHostDisconnect) {
    process.once("disconnect", onDisconnect);
    if (process.connected === false) onDisconnect();
  }

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
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    if (watchHostDisconnect) process.removeListener("disconnect", onDisconnect);
    try {
      await application.dispose("ACP connection closed", { fast: true });
    } catch (error) {
      connectionFailure = {
        error: connectionFailure
          ? new AggregateError(
              [connectionFailure.error, error],
              "ACP connection and application shutdown failed.",
            )
          : error,
      };
    } finally {
      process.stdout.write = originalStdoutWrite;
    }
  }
  if (connectionFailure) throw connectionFailure.error;
}
