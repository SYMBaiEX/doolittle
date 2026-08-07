import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { describe, expect, test } from "vitest";
import formsPlugin, { createFormsPlugin } from ".";
import { NATIVE_DEFAULT_TEMPLATES } from "./service";

describe("formsPlugin", () => {
  test("exposes a native forms service", () => {
    expect(formsPlugin.name).toBe("@doolittle/plugin-forms");
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

  test("bridges default templates into an available native FormService", async () => {
    const registered: string[] = [];
    const nativeSession = { id: "native-session" };
    const runtime = {
      getService: () => ({
        registerForm: (definition: { id: string }) =>
          registered.push(definition.id),
        startSession: async () => nativeSession,
      }),
    } as unknown as IAgentRuntime;
    const FormsService = formsPlugin.services?.[0] as ServiceClass;
    const service = (await FormsService.start(runtime)) as Service & {
      startNativeSession(
        templateOrForm: unknown,
        entityId: string,
        roomId: string,
      ): Promise<unknown>;
    };

    expect(registered).toEqual(NATIVE_DEFAULT_TEMPLATES.map((form) => form.id));
    await expect(
      service.startNativeSession(
        "project_scaffold",
        "entity" as never,
        "room" as never,
      ),
    ).resolves.toBe(nativeSession);
  });

  test("keeps local forms available when the native FormService is absent", async () => {
    const FormsService = formsPlugin.services?.[0] as ServiceClass;
    const service = (await FormsService.start({
      getService: () => null,
    } as unknown as IAgentRuntime)) as Service & {
      startNativeSession(
        templateOrForm: unknown,
        entityId: string,
        roomId: string,
      ): Promise<unknown>;
    };

    await expect(
      service.startNativeSession(
        "project_scaffold",
        "entity" as never,
        "room" as never,
      ),
    ).rejects.toThrow("Native FormService is unavailable");
  });
});
