import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWorkspaceAction,
  resolveLocalProjectPath,
  resolveWorkspaceIntentFromParams,
} from "./workspace-action";

describe("resolveLocalProjectPath", () => {
  it("resolves account-relative home paths like symbiex/dev", () => {
    const parent = join(tmpdir(), `doolittle-home-${Date.now()}`);
    const home = join(parent, "symbiex");
    const dev = join(home, "dev");
    mkdirSync(dev, { recursive: true });

    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(resolveLocalProjectPath("symbiex/dev", "/workspace")).toBe(dev);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("resolveWorkspaceIntentFromParams", () => {
  it("parses broad inspection intents from action parameters", () => {
    expect(
      resolveWorkspaceIntentFromParams({
        intent: "overview",
        path: "packages/agent",
      }),
    ).toEqual({
      kind: "overview",
      path: "packages/agent",
    });
  });
});

describe("workspace action contract", () => {
  it("is planner-selectable and executes structured parameters first", async () => {
    const action = createWorkspaceAction("/workspace");
    const runtime = {
      getService(serviceType: string) {
        return serviceType === "coding_agent"
          ? {
              workspaceSummary: () => "workspace tree",
            }
          : null;
      },
    };

    await expect(
      action.validate(
        runtime as never,
        { content: { text: "Please inspect the project." } } as never,
      ),
    ).resolves.toBe(true);
    await expect(
      action.handler(
        runtime as never,
        {
          content: { text: "This text has no legacy workspace intent." },
        } as never,
        undefined,
        { parameters: { intent: "tree" } },
      ),
    ).resolves.toMatchObject({
      success: true,
      text: "workspace tree",
      verifiedUserFacing: true,
    });
    expect(action.parameters?.map((parameter) => parameter.name)).toEqual([
      "intent",
      "path",
      "query",
    ]);
  });
});
