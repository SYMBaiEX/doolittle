import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AcpService,
  InMemorySessionStore,
} from "@elizaos/plugin-agent-orchestrator";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const sdkRoot = dirname(
  require.resolve("@elizaos/plugin-agent-orchestrator/package.json"),
);
const cjs = require(join(sdkRoot, "dist/cjs/index.node.cjs")) as {
  AcpService: typeof AcpService;
  InMemorySessionStore: typeof InMemorySessionStore;
};
type Session = Parameters<InMemorySessionStore["create"]>[0];
interface Hooks {
  nativeAgentCommand(agent: string): string;
  buildEnv(): NodeJS.ProcessEnv;
  spawnNativeSession(
    id: string,
    session: Session,
    options: { timeoutMs: number },
  ): Promise<Record<string, unknown>>;
}
const resources: Array<{ root: string; service: AcpService }> = [];
afterEach(async () => {
  for (const { root, service } of resources.splice(0)) {
    await service.stop();
    await rm(root, { recursive: true, force: true });
  }
});

// Static, test-owned ACP wire responder. Only synthetic environment is supplied;
// no provider, authentication, account selection, git or external process is run.
const responder = `const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
 const request = JSON.parse(line);
 let result = {};
 if(request.method === 'initialize') result = {protocolVersion:1,agentCapabilities:{}};
 if(request.method === 'session/new') result = {sessionId:'synthetic-protocol',...JSON.parse(process.env.ACP_TEST_RESULT)};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
});`;
const selector = (id: string, category: string, currentValue: string) => ({
  id,
  category,
  type: "select",
  currentValue,
  options: [{ description: "PRIVATE_CANARY", value: "unused" }],
  description: "PRIVATE_CANARY",
});

describe.each([
  ["ESM", AcpService, InMemorySessionStore],
  ["CJS", cjs.AcpService, cjs.InMemorySessionStore],
] as const)(
  "actual SDK initial selection projection (%s)",
  (_name, Service, Store) => {
    async function fixture(response: unknown, agentType = "codex") {
      const root = await mkdtemp(join(tmpdir(), "doolittle-acp-initial-"));
      const entry = join(root, "responder.cjs");
      await writeFile(entry, responder, { mode: 0o600 });
      const store = new Store();
      const workdir = join(root, "workspace");
      await mkdir(workdir);
      const session: Session = {
        id: "exact-local",
        agentType,
        workdir,
        status: "running",
        approvalPreset: "standard",
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata: { initialModelSelection: "CALLER_CANARY" },
      };
      await store.create(session);
      const service = new Service(
        {
          getSetting: () => undefined,
          logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        } as unknown as ConstructorParameters<typeof AcpService>[0],
        { store },
      );
      resources.push({ root, service });
      // Only transport construction is injected. Exercise real NativeAcpClient,
      // session/new decoding, public spawn result, store update and ready event.
      const hooks = service as unknown as Hooks;
      hooks.nativeAgentCommand = () => `${process.execPath} ${entry}`;
      hooks.buildEnv = () => ({ ACP_TEST_RESULT: JSON.stringify(response) });
      const events: unknown[] = [];
      service.onSessionEvent((_id, _event, data) => events.push(data));
      const result = await hooks.spawnNativeSession(session.id, session, {
        timeoutMs: 2000,
      });
      expect(result.sessionId).toBe("exact-local");
      expect(result.acpxSessionId).toBe("synthetic-protocol");
      expect((await store.get(session.id))?.metadata).toEqual(session.metadata);
      expect(JSON.stringify(await store.get(session.id))).not.toContain(
        "gpt-6-luna",
      );
      expect(JSON.stringify(events)).not.toContain("gpt-6-luna");
      expect(await readFile(entry, "utf8")).toBe(responder);
      return result.initialModelSelection as
        | Record<string, unknown>
        | undefined;
    }
    it("projects only selected scalars; catalogs/metadata cannot become provenance", async () => {
      const value = await fixture({
        configOptions: [
          selector("model", "model", "gpt-6-luna"),
          selector("reasoning_effort", "thought_level", "medium"),
        ],
        models: {
          currentModelId: "gpt-6-luna[medium]",
          availableModels: [{ description: "PRIVATE_CANARY" }],
        },
      });
      expect(value).toEqual({
        schemaVersion: 1,
        source: "acp-session-new",
        commandProvenance: "unverified",
        state: "reported",
        config: { model: "gpt-6-luna", reasoningEffort: "medium" },
        legacyModelId: "gpt-6-luna[medium]",
      });
      expect(JSON.stringify(value)).not.toContain("CANARY");
    });
    it("retains absent config effort as null and absent evidence as unavailable", async () => {
      expect(
        await fixture({
          configOptions: [selector("model", "model", "gpt-6-luna")],
        }),
      ).toMatchObject({ state: "reported", config: { reasoningEffort: null } });
      expect(await fixture({})).toMatchObject({
        state: "unavailable",
        config: null,
        legacyModelId: null,
      });
    });
    it.each([
      {
        configOptions: [
          selector("model", "model", "gpt-6-luna"),
          selector("model", "model", "gpt-6-luna"),
        ],
      },
      { configOptions: [selector("model", "thought_level", "gpt-6-luna")] },
      { configOptions: [selector("model", "model", "bad\nmodel")] },
      { models: { currentModelId: "bad\nmodel" } },
    ])(
      "rejects malformed/duplicate scalars without retaining them",
      async (response) => {
        expect(await fixture(response)).toMatchObject({
          state: "rejected",
          config: null,
          legacyModelId: null,
        });
      },
    );
    it.each([
      {
        configOptions: Array.from({ length: 33 }, () =>
          selector("other", "mode", "x"),
        ),
      },
      { configOptions: [selector("model", "model", "x".repeat(161))] },
      { models: { currentModelId: "x".repeat(201) } },
    ])("marks truncation rather than accepting a prefix", async (response) => {
      expect(await fixture(response)).toMatchObject({
        state: "truncated",
        config: null,
        legacyModelId: null,
      });
    });
    it("does not attach model observation to other adapters", async () => {
      expect(
        await fixture(
          { configOptions: [selector("model", "model", "gpt-6-luna")] },
          "claude",
        ),
      ).toBeUndefined();
    });
  },
);
