import type { ActionResult } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  assessTurnExecutionContract,
  buildTurnExecutionContract,
} from "./execution-contract";
import {
  hasSuccessfulWorkspaceBuild,
  verifyWorkspaceNoopCompletion,
  workspaceNoopRequirements,
} from "./workspace-noop-completion";

const workdir = "/workspace/blog";
const previewUrl = "http://localhost:3001/";

function createVerifiedNoopResults(): ActionResult[] {
  return [
    {
      success: true,
      text: "Existing implementation already satisfies the request; no changes were needed.",
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          workdir,
          summary:
            "The existing implementation already satisfies the requested app requirements. No changes were needed.",
          changedFiles: [],
          verifiedLocalMutation: false,
        },
      },
    },
    {
      success: true,
      text: "Bun install and production build passed.",
      data: {
        actionName: "SHELL",
        command: `cd ${workdir} && bun install --frozen-lockfile && bun run build`,
        exitCode: 0,
        cwd: workdir,
      },
    },
    {
      success: true,
      text: "Application is ready at the verified URL.",
      data: {
        actionName: "DOOLITTLE_APP_SERVER",
        status: "ready",
        url: previewUrl,
        session: {
          id: "managed-app-1",
          cwd: workdir,
          command: "bun run dev",
        },
      },
    },
    {
      success: true,
      text: "HTTP 200",
      data: {
        actionName: "SHELL",
        command: `curl -fsS -o /tmp/blog.html ${previewUrl}`,
        exitCode: 0,
        cwd: workdir,
      },
    },
  ] as ActionResult[];
}

describe("verified no-op workspace completion", () => {
  it("requires a successful Bun production build in the delegated workspace", () => {
    const results = createVerifiedNoopResults();
    expect(hasSuccessfulWorkspaceBuild(results, workdir)).toBe(true);
    expect(hasSuccessfulWorkspaceBuild(results, "/workspace/other")).toBe(
      false,
    );

    const failed = createVerifiedNoopResults();
    const build = failed[1];
    if (build?.data) {
      build.data = { ...build.data, exitCode: 1 };
    }
    expect(hasSuccessfulWorkspaceBuild(failed, workdir)).toBe(false);
  });

  it("accepts an explicit no-op only after scoped Bun, build, server, and URL receipts", () => {
    expect(
      verifyWorkspaceNoopCompletion(
        createVerifiedNoopResults(),
        workspaceNoopRequirements(
          "Create a blog app, install with Bun, run a production build, and start the application.",
        ),
      ),
    ).toEqual({
      workdir,
      verificationKinds: ["build"],
      bunInstallVerified: true,
      buildVerified: true,
      url: previewUrl,
      sessionId: "managed-app-1",
    });
  });

  it("keeps a requested mutation incomplete when the page URL was not checked", () => {
    const results = createVerifiedNoopResults().slice(0, 3);
    const contract = buildTurnExecutionContract({
      userRequest: "Create a blog app, build it, and start the application.",
      actionResults: results,
    });

    expect(
      assessTurnExecutionContract({ contract, actionResults: results }),
    ).toMatchObject({
      ok: false,
      failureMessage: expect.stringContaining("REQUESTED_LOCAL_MUTATION"),
    });
  });

  it("does not require a managed server when the user only requested code verification", () => {
    const results = createVerifiedNoopResults().slice(0, 2);
    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create the blog app only if needed; otherwise verify its production build.",
        ),
      ),
    ).toMatchObject({
      workdir,
      verificationKinds: ["build"],
    });
    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create the blog app only if needed; otherwise verify its production build.",
        ),
      ),
    ).not.toHaveProperty("url");
  });

  it.each([
    {
      label: "a failed build",
      mutate(results: ActionResult[]) {
        const build = results[1];
        if (build) {
          build.success = false;
          build.data = { ...build.data, exitCode: 1 };
        }
      },
    },
    {
      label: "a server for another directory",
      mutate(results: ActionResult[]) {
        const server = results[2];
        if (server?.data && typeof server.data === "object") {
          server.data = {
            ...server.data,
            session: {
              id: "other",
              cwd: "/workspace/elsewhere",
              command: "bun run dev",
            },
          };
        }
      },
    },
    {
      label: "a non-local URL",
      mutate(results: ActionResult[]) {
        const server = results[2];
        if (server?.data && typeof server.data === "object") {
          server.data = { ...server.data, url: "https://example.com/" };
        }
      },
    },
    {
      label: "a vague agent completion without a no-op attestation",
      mutate(results: ActionResult[]) {
        const delegate = results[0];
        const receipt = delegate?.data?.delegatedExecution;
        if (
          delegate?.data &&
          receipt &&
          typeof receipt === "object" &&
          !Array.isArray(receipt)
        ) {
          delegate.data.delegatedExecution = {
            ...(receipt as Record<string, unknown>),
            summary: "Inspected the project and completed the task.",
          };
          delegate.text = "Inspected the project and completed the task.";
        }
      },
    },
  ])("rejects $label", ({ mutate }) => {
    const results = createVerifiedNoopResults();
    mutate(results);
    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create a blog app, install with Bun, run a production build, and start the application.",
        ),
      ),
    ).toBeUndefined();
  });

  it("does not treat parent no-op instructions as the delegate's attestation", () => {
    const results = createVerifiedNoopResults();
    const delegate = results[0];
    if (delegate?.data && typeof delegate.data === "object") {
      delegate.text =
        "If the existing implementation already satisfies the request, report no changes were needed.";
      delegate.data.delegatedExecution = {
        ...(delegate.data.delegatedExecution as Record<string, unknown>),
        summary: "Implemented and verified the blog.",
      };
    }

    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create a blog app, install with Bun, run a production build, and start the application.",
        ),
      ),
    ).toBeUndefined();
  });

  it("does not hide any attempted local file mutation behind a no-op report", () => {
    const results = createVerifiedNoopResults();
    results.push({
      success: false,
      data: { actionName: "WRITE_FILE", mutationAction: "WRITE_FILE" },
    } as ActionResult);

    expect(verifyWorkspaceNoopCompletion(results)).toBeUndefined();
  });
});
