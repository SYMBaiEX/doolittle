import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindPluginStorage } from "../../packages/agent/src/runtime/bootstrap/env/plugin-storage";
import { createFormsPlugin } from "../../packages/plugins/doolittle-plugin/forms";
import { createPlanningPlugin } from "../../packages/plugins/doolittle-plugin/planning";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "doolittle-plugin-storage-"));
  temporaryRoots.push(root);
  return root;
}

function instantiateOnlyService(plugin: { services?: unknown[] }): void {
  const Service = plugin.services?.[0] as
    | (new (
        runtime?: undefined,
      ) => unknown)
    | undefined;
  expect(Service).toBeDefined();
  if (Service) {
    new Service(undefined);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("plugin storage composition", () => {
  it("binds forms and planning stores only at explicit runtime data roots", () => {
    const root = temporaryRoot();
    const fallbackRoot = join(root, "environment-fallback");
    const dataRoot = join(root, "explicit-data", "plugins");
    vi.stubEnv("DOOLITTLE_DATA_DIR", fallbackRoot);

    const formsStorage = bindPluginStorage("forms", { dataRoot });
    const planningStorage = bindPluginStorage("planning", { dataRoot });
    expect(formsStorage.rootDir).toBe(join(dataRoot, "forms"));
    expect(planningStorage.rootDir).toBe(join(dataRoot, "planning"));

    instantiateOnlyService(createFormsPlugin({ storage: formsStorage }));
    instantiateOnlyService(createPlanningPlugin({ storage: planningStorage }));

    expect(existsSync(join(dataRoot, "forms", "forms-store.json"))).toBe(true);
    expect(existsSync(join(dataRoot, "planning", "plans-store.json"))).toBe(
      true,
    );
    expect(existsSync(join(fallbackRoot, "plugins"))).toBe(false);
  });

  it("requires explicit runtime storage roots", () => {
    expect(() => bindPluginStorage("forms", { dataRoot: " " })).toThrow(
      /explicit scope and data root/u,
    );
  });

  it("keeps contracts storage declarations free of runtime environment access", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/contracts/src/types/storage.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/node:|process\.env|homedir|bindPluginStorage/u);
  });
});
