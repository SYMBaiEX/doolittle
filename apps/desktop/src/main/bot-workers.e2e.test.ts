import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BackendManager,
  type BackendManagerOptions,
  sourceRuntimeTarget,
} from "./backend";
import { BotProcessRegistry } from "./bot-process-registry";

// Explicit opt-in: two actual server processes, private temporary homes, and
// only the offline model. The normal unit suite never launches a runtime.
describe.skipIf(process.env.DOOLITTLE_WORKER_E2E !== "1")(
  "two isolated offline bot workers",
  () => {
    it("attests distinct identities and keeps data and CLI homes separate", async () => {
      const directory = mkdtempSync(
        resolve(tmpdir(), "doolittle-workers-e2e-"),
      );
      const workspace = resolve(directory, "workspace");
      const forbiddenHome = resolve(directory, "forbidden-host-home");
      mkdirSync(workspace, { recursive: true });
      mkdirSync(resolve(forbiddenHome, ".codex"), { recursive: true });
      mkdirSync(resolve(forbiddenHome, ".claude"), { recursive: true });
      writeFileSync(
        resolve(forbiddenHome, ".codex", "auth.json"),
        '{"sentinel":true}',
      );
      writeFileSync(
        resolve(forbiddenHome, ".claude", "auth.json"),
        '{"sentinel":true}',
      );
      const target = sourceRuntimeTarget(process.cwd());
      target.environment = {
        HOME: forbiddenHome,
        CODEX_HOME: resolve(forbiddenHome, ".codex"),
        CLAUDE_CONFIG_DIR: resolve(forbiddenHome, ".claude"),
        OPENAI_API_KEY: "forbidden-test-sentinel",
      };
      const defaultBackend = {
        getState: () => ({
          phase: "ready",
          agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
          name: "Doolittle",
        }),
        getWorkspaceDirectory: () => workspace,
      } as unknown as BackendManager;
      const configurations: BackendManagerOptions[] = [];
      const registry = new BotProcessRegistry(
        target,
        directory,
        defaultBackend,
        workspace,
        {
          createBackend: (
            launchTarget,
            dataDir,
            path,
            runtimeFetch,
            options,
          ) => {
            configurations.push(options);
            return new BackendManager(
              launchTarget,
              dataDir,
              path,
              runtimeFetch,
              options,
            );
          },
        },
      );
      try {
        const first = registry.create({
          name: "Worker One",
          persona: "One isolated bot.",
          model: { provider: "offline", model: "offline" },
        });
        const second = registry.create({
          name: "Worker Two",
          persona: "Another isolated bot.",
          model: { provider: "offline", model: "offline" },
        });
        await Promise.all([
          registry.activate(first.id),
          registry.activate(second.id),
        ]);
        expect(configurations).toHaveLength(2);
        for (const config of configurations) {
          const env = config.isolatedEnvironment;
          expect(env?.HOME).not.toBe(forbiddenHome);
          expect(env?.CODEX_HOME).toContain("/bots/");
          expect(env?.CLAUDE_CONFIG_DIR).toContain("/bots/");
          expect(env?.OPENAI_API_KEY).toBeUndefined();
        }
        const one = await registry.backendFor(first.id);
        const two = await registry.backendFor(second.id);
        expect(one.getState().url).not.toBe(two.getState().url);
        const identities = await Promise.all(
          [one, two].map(async (backend) => {
            const response = await fetch(
              `${backend.getState().url}/runtime/bot-identity`,
            );
            expect(response.status).toBe(200);
            return response.json() as Promise<{
              botId: string;
              agentId: string;
            }>;
          }),
        );
        expect(identities.map((value) => value.botId)).toEqual([
          first.id,
          second.id,
        ]);
        expect(identities.map((value) => value.agentId)).toEqual([
          first.agentId,
          second.agentId,
        ]);
        expect(registry.dataDirectory(first.id)).not.toBe(
          registry.dataDirectory(second.id),
        );
      } finally {
        await registry.stopAll();
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
