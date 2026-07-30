import { Readable } from "node:stream";
import { ndJsonStream } from "@doolittle/acp";
import { getAppContext } from "@/runtime/bootstrap";
import { loadBootstrapConfig } from "@/runtime/bootstrap/env";
import { getRuntimeToolProjection } from "@/runtime/native/service-bridge/service-resolution";
import { createServices } from "@/services";
import { createAcpProtocolHost } from "@/services/acp/host";

/**
 * Runs Doolittle's ACP stdio server.
 *
 * ACP owns stdout end-to-end: every byte written there must be newline-delimited
 * JSON-RPC. Application logs therefore move to stderr before booting the
 * runtime. Keep this separate from the HTTP/API entrypoint so editor clients
 * never receive an API banner or structured application log as protocol input.
 */
export async function startAcpServer(): Promise<void> {
  const writeProtocolBytes = process.stdout.write.bind(process.stdout);
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

  const config = loadBootstrapConfig();
  const services = createServices(config);
  const lightweightContext = {
    config,
    services,
  } as Parameters<typeof createAcpProtocolHost>[0];
  const localHost = createAcpProtocolHost(lightweightContext);
  services.acp.bindProtocolHost({
    ...localHost,
    async executeTurn(input) {
      const context = await getAppContext({
        startupMode: "api",
        eagerDeferredHydration: true,
      });
      services.acp.bindRuntimeTools(() =>
        getRuntimeToolProjection(context.runtime).tools.filter(
          (tool) => tool.enabled,
        ),
      );
      return createAcpProtocolHost(context).executeTurn(input);
    },
  });
  const stream = ndJsonStream(
    protocolOutput,
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  );
  const connection = services.acp.agentApp().connect(stream);

  await connection.closed;
}
