import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  assertEvalRuntimeEnvironment,
  createEvalRuntimeEnvironment,
} from "../../packages/evals/src/runtime-environment";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-eval-vault-"));
  roots.push(root);
  return {
    root,
    repoRoot: process.cwd(),
    mode: "cli" as const,
    baseEnvironment: isolatedRuntimeEnvironment(join(root, "data")),
  };
}
it("keeps SDK account and vault state private to each fixture without using the keychain", () => {
  const options = fixture();
  const env = createEvalRuntimeEnvironment(options);
  expect(env.ELIZA_STATE_DIR).toBe(join(options.root, "data"));
  expect(env.ELIZA_VAULT_DISABLE_KEYCHAIN).toBe("1");
  expect(env.ELIZA_VAULT_PASSPHRASE).toHaveLength(64);
  expect(createEvalRuntimeEnvironment(options).ELIZA_VAULT_PASSPHRASE).toBe(
    env.ELIZA_VAULT_PASSPHRASE,
  );
  expect(
    createEvalRuntimeEnvironment(fixture()).ELIZA_VAULT_PASSPHRASE,
  ).not.toBe(env.ELIZA_VAULT_PASSPHRASE);
});
it("rejects an evaluation that redirects SDK state back to the operator", () => {
  const options = fixture();
  const env = createEvalRuntimeEnvironment(options);
  expect(() =>
    assertEvalRuntimeEnvironment(
      { ...env, ELIZA_STATE_DIR: join(options.root, "operator") },
      options,
    ),
  ).toThrow("SDK state preflight");
  expect(() =>
    assertEvalRuntimeEnvironment(
      { ...env, ELIZA_VAULT_DISABLE_KEYCHAIN: "0" },
      options,
    ),
  ).toThrow("SDK state preflight");
});
