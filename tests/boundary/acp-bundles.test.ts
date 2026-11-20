import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AcpPersistence } from "../../packages/agent/src/services/acp/persistence";

it("archives ACP bundles only after validating the import", () => {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-acp-import-"));
  try {
    const persistence = new AcpPersistence({
      exportDir: directory,
      importDir: directory,
      registryDir: directory,
      registryPath: join(directory, "registry.json"),
      rootPackagePath: join(directory, "package.json"),
    });
    for (const payload of [
      "null",
      "[]",
      '{"package":null}',
      '{"tools":0}',
      '{"label":false}',
    ])
      expect(() => persistence.importBundle(payload)).toThrow();
    expect(readdirSync(directory)).toEqual([]);

    const bundle = {
      label: "coding",
      package: { name: "example-acp" },
      tools: [],
      metadata: { preserved: true },
    };
    const first = persistence.importBundle(JSON.stringify(bundle));
    const second = persistence.importBundle(JSON.stringify(bundle));
    expect(first).toMatchObject({
      label: "coding",
      packageName: "example-acp",
      toolCount: 0,
    });
    expect(second.path).not.toBe(first.path);
    expect(JSON.parse(readFileSync(first.path, "utf8"))).toEqual(bundle);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
