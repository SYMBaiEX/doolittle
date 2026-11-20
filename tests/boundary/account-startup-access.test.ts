import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { sourceRuntimeTarget } from "../../apps/desktop/src/main/backend";
import {
  readDoolittleAccountPoolSnapshot,
  refreshDoolittleAccountPoolInventory,
} from "../../packages/agent/src/runtime/native/account-pool";

it("boots account routing with a locked legacy credential without reading or rewriting it", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-account-startup-"));
  const record = join(root, "auth/openai-codex/doolittle-legacy-codex.json");
  mkdirSync(dirname(record), { recursive: true });
  const contents = JSON.stringify({
    id: "doolittle-legacy-codex",
    providerId: "openai-codex",
    label: "Fixture",
    source: "oauth",
    credentials: { access: "fixture-only", refresh: "", expires: 0 },
    createdAt: 1,
    updatedAt: 1,
  });
  writeFileSync(record, contents, { mode: 0o600 });
  const script = join(root, "probe.ts");
  writeFileSync(
    script,
    `
    import assert from 'node:assert/strict';
    const {initializeDoolittleAccountPool, importLegacyDoolittleAccounts, readDoolittleAccountPoolSnapshot} = await import(${JSON.stringify(resolve("packages/agent/src/runtime/native/account-pool/index.ts"))});
    const pool = initializeDoolittleAccountPool(${JSON.stringify(root)});
    assert.ok(pool);
    assert.equal(readDoolittleAccountPoolSnapshot(pool).providers["openai-codex"].accounts.length, 0);
    const {getRuntimeProviderAccountsSnapshot} = await import(${JSON.stringify(resolve("packages/agent/src/runtime/native/provider-accounts.ts"))});
    const runtime = {getService: () => { throw new Error("unexpected provider probe"); }};
    const accounts = getRuntimeProviderAccountsSnapshot(runtime);
    assert.equal(accounts.codex.reusable, false);
    assert.match(accounts.codex.detail, /not probed/i);
    assert.throws(() => importLegacyDoolittleAccounts(), /master key unavailable|OS keychain is unsafe/i);
    console.log('LOCKED_STARTUP_OK');
  `,
  );
  try {
    const target = sourceRuntimeTarget(process.cwd());
    const output = execFileSync(target.executable, [script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      env: {
        PATH: [dirname(process.execPath), process.env.PATH]
          .filter(Boolean)
          .join(delimiter),
        HOME: root,
        USERPROFILE: root,
        NODE_ENV: "production",
        DOOLITTLE_DATA_DIR: root,
        ELIZA_HOME: root,
        ELIZA_STATE_DIR: root,
        ELIZA_VAULT_DISABLE_KEYCHAIN: "1",
      },
    });
    expect(output).toContain("LOCKED_STARTUP_OK");
    expect(readFileSync(record, "utf8")).toBe(contents);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps passive inventory read-only and retains its last observed accounts when storage is unavailable", () => {
  const list = vi.fn(() => [
    {
      providerId: "openai-api",
      id: "saved-openai",
      source: "api-key",
      label: "Development",
      enabled: true,
      priority: 1,
      createdAt: 1,
      health: "ok",
    },
  ]);
  const pool = { list } as unknown as Parameters<
    typeof refreshDoolittleAccountPoolInventory
  >[0];
  expect(readDoolittleAccountPoolSnapshot(pool).inventory).toBe("unchecked");
  expect(list).not.toHaveBeenCalled();

  const inventory = refreshDoolittleAccountPoolInventory(pool);
  expect(inventory.inventory).toBe("ready");
  expect(inventory.providers["openai-api"].accounts[0]?.accountId).toBe(
    "saved-openai",
  );

  list.mockImplementationOnce(() => {
    throw new Error("Locked secure storage");
  });
  expect(() => refreshDoolittleAccountPoolInventory(pool)).toThrow(
    "Saved accounts could not be read",
  );
  const unavailable = readDoolittleAccountPoolSnapshot(pool);
  expect(unavailable.inventory).toBe("unavailable");
  expect(unavailable.providers["openai-api"].accounts).toEqual(
    inventory.providers["openai-api"].accounts,
  );
  expect(list).toHaveBeenCalledTimes(2);
});
