import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVault, inMemoryMasterKey } from "@elizaos/vault";
import { afterEach, describe, expect, it } from "vitest";
import { createSecretsManagerService } from "./secretsService";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createTestService(root: string) {
  return createSecretsManagerService(root, () =>
    createVault({
      workDir: root,
      masterKey: inMemoryMasterKey(Buffer.alloc(32, 7)),
    }),
  );
}

describe("Eliza Vault secrets adapter", () => {
  it("stores sensitive values through the official vault", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-vault-"));
    roots.push(root);
    const Service = createTestService(root);
    const service = (await Service.start()) as InstanceType<typeof Service>;

    await service.setSecret("OPENAI_API_KEY", "secret-value");

    expect(await service.hasSecret("OPENAI_API_KEY")).toBe(true);
    expect(await service.getSecret("OPENAI_API_KEY")).toBe("secret-value");
    expect(service.listSecretKeys()).toEqual(["OPENAI_API_KEY"]);
    await service.stop();
  });

  it("imports and removes the legacy plaintext JSON store", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-vault-migration-"));
    roots.push(root);
    const legacyPath = join(root, "secrets.json");
    writeFileSync(
      legacyPath,
      JSON.stringify({ secrets: { GITHUB_TOKEN: "legacy-secret" } }),
      "utf8",
    );
    const Service = createTestService(root);
    const service = (await Service.start()) as InstanceType<typeof Service>;

    expect(await service.getSecret("GITHUB_TOKEN")).toBe("legacy-secret");
    expect(service.listSecretKeys()).toEqual(["GITHUB_TOKEN"]);
    expect(existsSync(legacyPath)).toBe(false);
    await service.stop();
  });
});
