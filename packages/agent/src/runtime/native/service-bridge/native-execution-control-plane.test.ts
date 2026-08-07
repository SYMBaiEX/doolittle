import {
  DOOLITTLE_CODE_GENERATION_SERVICE,
  DOOLITTLE_FORMS_SERVICE,
  DOOLITTLE_LOCAL_SANDBOX_SERVICE,
} from "@doolittle/contracts";
import { SECRETS_SERVICE_TYPE } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { getNativeExecutionControlPlaneDetails } from "./native-execution-control-plane";
import type { RuntimeLike } from "./runtime";

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
  it("reports unavailable capabilities when native services are missing", () => {
    const runtime = createRuntime({});

    const control = getNativeExecutionControlPlaneDetails(runtime, {
      source: "unavailable",
      available: false,
      actionPlanningAvailable: false,
      capability: "Planning unavailable.",
      plans: {
        total: 0,
        linkedTasks: 0,
        linkedWorkflows: 0,
      },
      supportsCreate: false,
      supportsApprove: false,
      supportsSteer: false,
      detail: "Planning unavailable.",
    });

    expect(control.approvals).toEqual({
      source: "unavailable",
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
    expect(control.secrets.keys).toEqual([]);
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
        [DOOLITTLE_LOCAL_SANDBOX_SERVICE]: {
          capabilityDescription: "Managed sandboxes",
          listSandboxes: () => [
            {
              id: "sandbox-1",
              path: "/sandboxes/sandbox-1",
            },
          ],
          executeCode: async () => ({ ok: true }),
        },
        [DOOLITTLE_FORMS_SERVICE]: {
          capabilityDescription: "Forms available",
        },
        [DOOLITTLE_CODE_GENERATION_SERVICE]: {
          capabilityDescription: "Codegen ready",
          performResearch: () => undefined,
          generateCode: () => undefined,
          runValidationSuite: () => undefined,
        },
        doolittle_github_planning: {
          capabilityDescription: "GitHub support",
          createRepository: async () => undefined,
        },
        [SECRETS_SERVICE_TYPE]: {
          capabilityDescription: "Secrets available",
          list: async () => ({ OPENAI_API_KEY: {}, GITHUB_TOKEN: {} }),
          getGlobal: async () => "secret",
          setGlobal: async () => true,
        },
      },
      ["readFile", "writeFile", "sendMessage"],
    );

    const control = getNativeExecutionControlPlaneDetails(runtime, {
      source: "product-plugin",
      available: true,
      actionPlanningAvailable: true,
      capability: "Planning available",
      plans: {
        total: 4,
        linkedTasks: 2,
        linkedWorkflows: 1,
      },
      supportsCreate: true,
      supportsApprove: true,
      supportsSteer: true,
      detail: "Planning wired.",
    });

    expect(control.approvals).toEqual({
      source: "native",
      available: true,
      asyncRequest: true,
      selectionHandling: true,
    });
    expect(control.e2b.available).toBe(true);
    expect(control.e2b.source).toBe("product-plugin");
    expect(control.e2b.sandboxes).toBe(1);
    expect(control.e2b.activeSandboxId).toBe("sandbox-1");
    expect(control.e2b.sandboxRoot).toBe("/sandboxes");
    expect(control.e2b.supportsExecution).toBe(true);
    expect(control.toolPolicy.actions).toBe(3);
    expect(control.toolPolicy.codingAllowed).toBe(2);
    expect(control.toolPolicy.messagingAllowed).toBe(1);
    expect(control.toolPolicy.fullAllowed).toBe(3);
    expect(control.codeGeneration.available).toBe(true);
    expect(control.codeGeneration.source).toBe("product-plugin");
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
    expect(control.secrets).toEqual({
      available: true,
      capability: "Secrets available",
      keys: [],
      hasListKeys: true,
      hasRead: true,
      hasWrite: true,
    });
    expect(control.planning.available).toBe(true);
  });
});
