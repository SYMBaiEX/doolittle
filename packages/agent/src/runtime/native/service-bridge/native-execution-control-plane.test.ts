import { describe, expect, it } from "bun:test";
import type { RuntimeLike } from "./runtime";
import { getNativeExecutionControlPlaneDetails } from "./native-execution-control-plane";

function createRuntime(
  services: Record<string, unknown>,
  actions: string[] = [],
) {
  return {
    getService(name: string) {
      return (services[name] as object | null | undefined) ?? null;
    },
    getAllActions() {
      return actions.map((name) => ({ name }));
    },
  } as RuntimeLike;
}

describe("native execution control plane", () => {
  it("reports unavailable product defaults when native services are missing", () => {
    const runtime = createRuntime({});

    const control = getNativeExecutionControlPlaneDetails(runtime, {
      source: "product",
      available: false,
      capability: "Planning unavailable.",
      plans: {
        total: 0,
        linkedTasks: 0,
        linkedWorkflows: 0,
      },
      supportsCreate: false,
      detail: "Planning unavailable.",
    });

    expect(control.approvals).toEqual({
      source: "product",
      available: false,
      asyncRequest: false,
      selectionHandling: false,
    });
    expect(control.agentEvents.available).toBe(false);
    expect(control.e2b.available).toBe(false);
    expect(control.toolPolicy.actions).toBe(0);
    expect(control.toolPolicy.codingAllowed).toBe(0);
    expect(control.codeGeneration.available).toBe(false);
    expect(control.codeGeneration.ready).toBe(false);
    expect(control.github.available).toBe(false);
    expect(control.secretsManager.keys).toEqual([]);
  });

  it("summarizes native services, tool policy, sandboxes, and automation helpers", () => {
    const runtime = createRuntime(
      {
        approval: {
          requestApprovalAsync: async () => "approval-id",
          handleSelection: async () => undefined,
        },
        tool_policy: {
          getAllowedTools: (
            context: { profile?: "minimal" | "coding" | "messaging" | "full" },
            availableTools: string[],
          ) => {
            if (context.profile === "coding") {
              return availableTools.filter((name) => name !== "sendMessage");
            }
            if (context.profile === "messaging") {
              return availableTools.filter((name) => name === "sendMessage");
            }
            return availableTools;
          },
        },
        e2b: {
          capabilityDescription: "Managed sandboxes",
          listSandboxes: () => [
            {
              id: "sandbox-1",
              path: "/sandboxes/sandbox-1",
            },
          ],
          executeCode: async () => ({ ok: true }),
        },
        forms: {
          capabilityDescription: "Forms available",
        },
        "code-generation": {
          capabilityDescription: "Codegen ready",
          performResearch: () => undefined,
          generateCode: () => undefined,
          runValidationSuite: () => undefined,
        },
        github: {
          capabilityDescription: "GitHub support",
          createRepository: async () => undefined,
        },
        "secrets-manager": {
          capabilityDescription: "Secrets available",
          listSecretKeys: () => ["OPENAI_API_KEY", "GITHUB_TOKEN"],
          getSecret: async () => "secret",
          setSecret: async () => undefined,
        },
      },
      ["readFile", "writeFile", "sendMessage"],
    );

    const control = getNativeExecutionControlPlaneDetails(runtime, {
      source: "native-plugin",
      available: true,
      capability: "Planning available",
      plans: {
        total: 4,
        linkedTasks: 2,
        linkedWorkflows: 1,
      },
      supportsCreate: true,
      detail: "Planning wired.",
    });

    expect(control.approvals).toEqual({
      source: "native",
      available: true,
      asyncRequest: true,
      selectionHandling: true,
    });
    expect(control.e2b.available).toBe(true);
    expect(control.e2b.sandboxes).toBe(1);
    expect(control.e2b.activeSandboxId).toBe("sandbox-1");
    expect(control.e2b.sandboxRoot).toBe("/sandboxes");
    expect(control.e2b.supportsExecution).toBe(true);
    expect(control.toolPolicy.actions).toBe(3);
    expect(control.toolPolicy.codingAllowed).toBe(2);
    expect(control.toolPolicy.messagingAllowed).toBe(1);
    expect(control.toolPolicy.fullAllowed).toBe(3);
    expect(control.codeGeneration.available).toBe(true);
    expect(control.codeGeneration.ready).toBe(true);
    expect(control.codeGeneration.methods).toEqual([
      "performResearch",
      "generateCode",
      "runValidationSuite",
    ]);
    expect(control.github).toEqual({
      available: true,
      capability: "GitHub support",
      createRepository: true,
      deleteRepository: false,
    });
    expect(control.secretsManager).toEqual({
      available: true,
      capability: "Secrets available",
      keys: ["OPENAI_API_KEY", "GITHUB_TOKEN"],
      hasListKeys: true,
      hasRead: true,
      hasWrite: true,
    });
    expect(control.planning.available).toBe(true);
  });
});
