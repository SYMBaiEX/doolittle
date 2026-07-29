#!/usr/bin/env nub
import { Readable } from "node:stream";
import { ndJsonStream } from "@doolittle/acp";
import { getAppContext } from "@/runtime/bootstrap";
import { loadBootstrapConfig } from "@/runtime/bootstrap/env";
import { createServices } from "@/services";
import { createAcpProtocolHost } from "@/services/acp/host";

// ACP reserves stdout for NDJSON. Redirect application/runtime logging to
// stderr and retain a private writer that only the protocol stream can use.
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
    return createAcpProtocolHost(context).executeTurn(input);
  },
});
const stream = ndJsonStream(
  protocolOutput,
  Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
);
const connection = services.acp.agentApp().connect(stream);

await connection.closed;
