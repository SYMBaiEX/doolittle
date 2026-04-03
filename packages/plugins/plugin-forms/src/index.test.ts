import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import formsPlugin, { createFormsPlugin } from ".";

describe("formsPlugin", () => {
  test("exposes a native forms service", () => {
    expect(formsPlugin.name).toBe("@elizaos/plugin-forms");
    expect(Array.isArray(formsPlugin.services)).toBe(true);
    expect(formsPlugin.services?.[0]).toBeDefined();
  });

  test("persists forms inside the injected data root", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-forms-"));
    const plugin = createFormsPlugin({
      storage: {
        dataRoot: root,
      },
    });
    const FormsService = plugin.services?.[0] as ServiceClass | undefined;
    const service = (await FormsService?.start(
      undefined as unknown as IAgentRuntime,
    )) as Service & {
      createForm(templateOrForm: unknown, metadata?: unknown): Promise<unknown>;
      forcePersist(): Promise<{ path: string; total: number }>;
    };

    await service.createForm("project_scaffold", { owner: "ops" });
    const persisted = await service.forcePersist();

    expect(persisted.total).toBe(1);
    expect(persisted.path).toContain("/forms/forms-store.json");
  });
});
