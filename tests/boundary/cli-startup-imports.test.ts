import { expect, it, vi } from "vitest";

it("loads the CLI environment without evaluating the runtime schema", async () => {
  vi.resetModules();
  vi.doMock("../../packages/agent/src/config/env/schema", () => {
    throw new Error(
      "The runtime schema should load during runtime activation.",
    );
  });
  vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "worker");
  vi.stubEnv("PGLITE_DATA_DIR", undefined);
  vi.stubEnv("DATABASE_URL", "unapproved-test-postgres");
  vi.stubEnv("POSTGRES_URL", "unapproved-test-postgres");
  vi.stubEnv("LOG_LEVEL", "error");
  vi.stubEnv("DEFAULT_LOG_LEVEL", "error");
  try {
    const { loadLocalRuntimeEnv } = await import(
      "../../apps/cli/src/cli/startup"
    );
    loadLocalRuntimeEnv();
    expect(process.env.PGLITE_DATA_DIR).toMatch(/[/\\]pglite$/u);
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.POSTGRES_URL).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    vi.doUnmock("../../packages/agent/src/config/env/schema");
    vi.resetModules();
  }
});
