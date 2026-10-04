import { resolveServerOnlyPort } from "@elizaos/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { acquireCliTerminalEndpoint } from "./cli-terminal-endpoint";

const keys = [
  "ELIZA_API_BIND",
  "ELIZA_API_PORT",
  "ELIZA_PORT",
  "ELIZA_UI_PORT",
  "ELIZA_TERMINAL_RUN_TOKEN",
  "ELIZA_API_TOKEN",
] as const;
const baseline = new Map(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) {
    const value = baseline.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const context = { config: { host: "0.0.0.0", port: 3000 } } as AppContext;
const address = {
  host: "127.0.0.1",
  port: 23456,
  url: "http://127.0.0.1:23456",
};

describe("owned CLI terminal lease", () => {
  it("overrides every inherited SDK port, leaves bearer untouched and restores exactly", async () => {
    process.env.ELIZA_PORT = "1111";
    process.env.ELIZA_API_PORT = "2222";
    process.env.ELIZA_UI_PORT = "3333";
    process.env.ELIZA_API_TOKEN = "inherited-test-bearer";
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "prior-test-capability";
    const close = vi.fn(async () => {});
    const start = vi.fn(async (owned: AppContext) => {
      expect(owned.config).toMatchObject({ host: "127.0.0.1", port: 0 });
      expect(process.env.ELIZA_TERMINAL_RUN_TOKEN).toMatch(/^[a-f0-9]{64}$/);
      expect(process.env.ELIZA_PORT).toBe("1111");
      return { address, close };
    });
    const lease = await acquireCliTerminalEndpoint(context, start);
    try {
      expect(resolveServerOnlyPort(process.env)).toBe(address.port);
      expect(process.env.ELIZA_UI_PORT).toBe(String(address.port));
      expect(process.env.ELIZA_API_TOKEN).toBe("inherited-test-bearer");
      await expect(acquireCliTerminalEndpoint(context, start)).rejects.toThrow(
        "already leased",
      );
    } finally {
      await lease.close();
    }
    await lease.close();
    expect(close).toHaveBeenCalledOnce();
    expect(process.env.ELIZA_PORT).toBe("1111");
    expect(process.env.ELIZA_API_PORT).toBe("2222");
    expect(process.env.ELIZA_UI_PORT).toBe("3333");
    expect(process.env.ELIZA_TERMINAL_RUN_TOKEN).toBe("prior-test-capability");
  });

  it("keeps later unrelated writes and rotates the capability on the next lease", async () => {
    const start = async () => ({ address, close: async () => {} });
    const first = await acquireCliTerminalEndpoint(context, start);
    const token = process.env.ELIZA_TERMINAL_RUN_TOKEN;
    process.env.ELIZA_PORT = "later-port";
    await first.close();
    expect(process.env.ELIZA_PORT).toBe("later-port");
    const second = await acquireCliTerminalEndpoint(context, start);
    try {
      expect(process.env.ELIZA_TERMINAL_RUN_TOKEN).not.toBe(token);
    } finally {
      await second.close();
    }
    expect(process.env.ELIZA_PORT).toBe("later-port");
  });

  it("restores capability and ownership after startup rejection", async () => {
    const before = process.env.ELIZA_TERMINAL_RUN_TOKEN;
    await expect(
      acquireCliTerminalEndpoint(context, async () => {
        throw new Error("listen failed");
      }),
    ).rejects.toThrow("listen failed");
    expect(process.env.ELIZA_TERMINAL_RUN_TOKEN === before).toBe(true);
    const lease = await acquireCliTerminalEndpoint(context, async () => ({
      address,
      close: async () => {},
    }));
    await lease.close();
  });
  it("does not hand an unconfirmed lease to another caller after close failure", async () => {
    vi.resetModules();
    const isolated = await import("./cli-terminal-endpoint");
    const start = async () => ({
      address,
      close: async () => {
        throw new Error("termination unconfirmed");
      },
    });
    const lease = await isolated.acquireCliTerminalEndpoint(context, start);
    await expect(lease.close()).rejects.toThrow("termination unconfirmed");
    await expect(
      isolated.acquireCliTerminalEndpoint(context, start),
    ).rejects.toThrow("already leased");
  });
});
