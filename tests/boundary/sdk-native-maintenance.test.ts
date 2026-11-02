import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

import { applyAmbientProcessSettings } from "../../packages/agent/src/runtime/bootstrap/env/plugin-settings/ambient";
import type { PluginSettings } from "../../packages/agent/src/runtime/bootstrap/env/plugin-settings/types";

const sdk = import.meta.resolve("@elizaos/plugin-agent-orchestrator");

it("rejects native ACP configuration before any SDK maintenance can start", () => {
  expect(() =>
    applyAmbientProcessSettings({} as PluginSettings, {
      ELIZA_ACP_TRANSPORT: "native",
    }),
  ).toThrow("must be cli");
});

for (const mode of ["cli"]) {
  it(`keeps ${mode} restart reconciliation within its own transport's ownership`, () => {
    const home = mkdtempSync(join(tmpdir(), "doolittle-acp-maintenance-"));
    try {
      const script = `
        import assert from 'node:assert/strict';
        import {mkdirSync, writeFileSync, utimesSync, existsSync} from 'node:fs';
        import {join} from 'node:path';
        import {AcpService, InMemorySessionStore} from ${JSON.stringify(sdk)};
        const mode = ${JSON.stringify(mode)};
        const root = join(process.env.HOME, '.acpx');
        mkdirSync(join(root, 'sessions'), {recursive: true});
        mkdirSync(join(root, 'queues'), {recursive: true});
        const lock = join(root, 'queues', 'other-client.lock');
        writeFileSync(lock, 'other-client');
        const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
        utimesSync(lock, old, old);
        writeFileSync(join(root, 'sessions', 'shared-id.json'), '{}');
        const store = new InMemorySessionStore();
        await store.create({id: 'prior-session', agentType: 'codex', workdir: process.env.HOME,
          status: 'busy', acpxSessionId: 'shared-id', approvalPreset: 'approve-reads',
          createdAt: new Date(), lastActivityAt: new Date()});
        const logger = {debug(){}, info(){}, warn(){}, error(){}};
        const service = new AcpService({logger, getSetting(key){
          return key === 'ELIZA_ACP_TRANSPORT' ? mode : undefined;
        }}, {store});
        try {
          await service.start();
          assert.equal((await service.getSession('prior-session')).status,
            'busy');
          assert.equal(existsSync(lock), false);
        } finally { await service.stop(); }
      `;
      expect(() =>
        execFileSync(
          process.execPath,
          ["--input-type=module", "--eval", script],
          {
            cwd: home,
            timeout: 15_000,
            stdio: "pipe",
            env: { PATH: process.env.PATH, HOME: home },
          },
        ),
      ).not.toThrow();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}
