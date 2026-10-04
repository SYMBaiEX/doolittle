import { randomBytes } from "node:crypto";
import { syncResolvedApiPort } from "@elizaos/shared";
import type { AppContext } from "@/runtime/bootstrap";
import type { OwnedApiServer } from "@/server";

let leased = false;

/** A capability and port owned by this CLI process, never by a foreign daemon. */
export async function acquireCliTerminalEndpoint(
  context: AppContext,
  start: (context: AppContext) => Promise<OwnedApiServer> = async (owned) =>
    (await import("@/server")).createApiServer(owned, { terminalOnly: true }),
): Promise<OwnedApiServer> {
  if (leased)
    throw new Error(
      "A CLI terminal endpoint is already leased in this process.",
    );
  leased = true;
  const keys = [
    "ELIZA_API_BIND",
    "ELIZA_API_PORT",
    "ELIZA_PORT",
    "ELIZA_UI_PORT",
    "ELIZA_TERMINAL_RUN_TOKEN",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const written = new Map<string, string>();
  const write = (key: string, value: string) => {
    process.env[key] = value;
    written.set(key, value);
  };
  const restore = () => {
    for (const key of keys) {
      if (process.env[key] !== written.get(key) || !written.has(key)) continue;
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  write("ELIZA_API_BIND", "127.0.0.1");
  write("ELIZA_TERMINAL_RUN_TOKEN", randomBytes(32).toString("hex"));
  let owned: OwnedApiServer;
  try {
    owned = await start({
      ...context,
      config: { ...context.config, host: "127.0.0.1", port: 0 },
    });
    syncResolvedApiPort(process.env, owned.address.port, {
      overwriteUiPort: true,
    });
    written.set("ELIZA_PORT", String(owned.address.port));
    written.set("ELIZA_API_PORT", String(owned.address.port));
    written.set("ELIZA_UI_PORT", String(owned.address.port));
  } catch (error) {
    restore();
    leased = false;
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    address: owned.address,
    close() {
      closing ??= (async () => {
        try {
          await owned.close();
          leased = false;
        } finally {
          // A later unrelated environment write belongs to its writer.
          restore();
        }
      })();
      return closing;
    },
  };
}
