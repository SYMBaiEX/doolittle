import type { IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { isTrustedLocalRequest } from "eliza-http/api/server-helpers-auth";
import { afterEach, expect, it, vi } from "vitest";

const requireFromRepo = createRequire(import.meta.url);
afterEach(() => vi.unstubAllEnvs());
it("resolves SQL and orchestration to their supported Node ESM entries for both import and require", () => {
  for (const [name, suffix] of [
    ["@elizaos/plugin-sql", "/src/dist/node/index.node.js"],
    ["@elizaos/plugin-agent-orchestrator", "/dist/node/index.node.js"],
  ]) {
    expect(import.meta.resolve(name).endsWith(suffix)).toBe(true);
    expect(requireFromRepo.resolve(name).endsWith(suffix)).toBe(true);
  }
});
it("runs the published HTTP policy without unpublished SDK compatibility packages", () => {
  for (const name of [
    "@elizaos/registry",
    "@elizaos/plugin-worker-runtime/error",
    "@elizaos/plugin-remote-manifest",
  ])
    expect(() => requireFromRepo.resolve(name)).toThrow();
  vi.stubEnv("ELIZA_CLOUD_PROVISIONED", "0");
  vi.stubEnv("ELIZA_REQUIRE_LOCAL_AUTH", "0");
  const request = (headers: IncomingMessage["headers"]) =>
    ({ socket: { remoteAddress: "127.0.0.1" }, headers }) as IncomingMessage;
  expect(isTrustedLocalRequest(request({ host: "localhost" }))).toBe(true);
  expect(
    isTrustedLocalRequest(
      request({ host: "localhost", origin: "https://attacker.example" }),
    ),
  ).toBe(false);
  expect(
    isTrustedLocalRequest(
      request({ host: "localhost", "x-forwarded-for": "203.0.113.1" }),
    ),
  ).toBe(false);
  vi.stubEnv("ELIZA_REQUIRE_LOCAL_AUTH", "1");
  expect(isTrustedLocalRequest(request({ host: "localhost" }))).toBe(false);
});
