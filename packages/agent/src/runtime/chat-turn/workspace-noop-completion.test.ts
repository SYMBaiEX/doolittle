import type { ActionResult } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  assessTurnExecutionContract,
  buildTurnExecutionContract,
} from "./execution-contract";
import {
  hasSuccessfulWorkspaceBuild,
  missingWorkspaceMutationRequirements,
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
        // The gateway starts shell tools at the selected project root; the
        // command's explicit `cd` selects the actual nested app workspace.
        cwd: "/workspace",
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
          managed: true,
          state: "running",
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

function createChangedWorkspaceResults(): ActionResult[] {
  return [
    {
      success: true,
      text: "Implemented the requested app and changed one file.",
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "coding-agent-1",
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          workdir,
          summary: "Implemented the requested app.",
          changedFiles: [{ path: "app/page.tsx", bytes: 420 }],
          verifiedLocalMutation: true,
        },
      },
    },
  ] as ActionResult[];
}

describe("verified no-op workspace completion", () => {
  it("treats an explicit Bun app launch as requiring install, build, and ready-server receipts", () => {
    expect(
      workspaceNoopRequirements(
        "Create the blog app, use Bun so we can run bun run dev, then start the application.",
      ),
    ).toEqual({
      requireBunInstall: true,
      requireBuild: true,
      requireManagedApplication: true,
    });
  });

  it("does not accept a changed-file receipt as completion without requested workspace operations", () => {
    const requirements = workspaceNoopRequirements(
      "Create the blog app, use Bun so we can run bun run dev, then start the application.",
    );
    expect(
      missingWorkspaceMutationRequirements(
        createChangedWorkspaceResults(),
        requirements,
      ),
    ).toEqual([
      `a successful Bun install in ${workdir}`,
      `a successful production build in ${workdir}`,
      `a ready managed app server with a verified local URL in ${workdir}`,
    ]);
  });

  it("requires each parent receipt to follow the edit and match its exact workspace", () => {
    const requirements = workspaceNoopRequirements(
      "Create the blog app, use Bun, build it, and start the application.",
    );
    const results = [
      ...createChangedWorkspaceResults(),
      {
        success: true,
        data: {
          actionName: "SHELL",
          command: `cd "${workdir}" && bun install --frozen-lockfile`,
          exitCode: 0,
        },
      },
      {
        success: true,
        data: {
          actionName: "SHELL",
          command: `cd "${workdir}" && bun run build`,
          exitCode: 0,
        },
      },
      {
        success: true,
        data: {
          actionName: "DOOLITTLE_APP_SERVER",
          status: "ready",
          url: previewUrl,
          session: {
            id: "managed-app-1",
            cwd: workdir,
            command: "bun run dev",
            managed: true,
            state: "running",
          },
        },
      },
    ] as ActionResult[];

    expect(missingWorkspaceMutationRequirements(results, requirements)).toEqual(
      [],
    );

    const wrongDirectory = results.map((result) => ({
      ...result,
      data: result.data ? { ...result.data } : undefined,
    })) as ActionResult[];
    const build = wrongDirectory[2];
    if (build?.data) {
      build.data.command = "cd /workspace/another-app && bun run build";
    }
    expect(
      missingWorkspaceMutationRequirements(wrongDirectory, requirements),
    ).toContain(`a successful production build in ${workdir}`);
  });

  it("requires Bun installation before the successful build", () => {
    const requirements = workspaceNoopRequirements(
      "Create the blog app, use Bun, build it, and start the application.",
    );
    const results = [
      ...createChangedWorkspaceResults(),
      {
        success: true,
        data: {
          actionName: "SHELL",
          command: `cd "${workdir}" && bun run build`,
          exitCode: 0,
        },
      },
      {
        success: true,
        data: {
          actionName: "SHELL",
          command: `cd "${workdir}" && bun install`,
          exitCode: 0,
        },
      },
    ] as ActionResult[];

    expect(missingWorkspaceMutationRequirements(results, requirements)).toEqual(
      [
        "Bun install before the production build",
        `a ready managed app server with a verified local URL in ${workdir}`,
      ],
    );
    results.push({
      success: true,
      data: {
        actionName: "SHELL",
        command: `bun run --cwd ${workdir} build`,
        exitCode: 0,
      },
    });
    expect(missingWorkspaceMutationRequirements(results, requirements)).toEqual(
      [`a ready managed app server with a verified local URL in ${workdir}`],
    );
  });

  it.each([
    "bun run start",
    "bun run serve",
    "npm run start",
    "node server.js",
  ])(
    "accepts an HTTP-ready managed application launched with %s",
    (command) => {
      const results = createVerifiedNoopResults().slice(0, 3);
      const server = results[2];
      if (server?.data) {
        server.data.session = {
          ...(server.data.session as Record<string, unknown>),
          command,
        };
      }
      const requirements = workspaceNoopRequirements(
        "Create a blog app, install with Bun, run a production build, and start the application.",
      );
      expect(
        verifyWorkspaceNoopCompletion(results, requirements),
      ).toMatchObject({
        workdir,
        bunInstallVerified: true,
        buildVerified: true,
        url: previewUrl,
        sessionId: "managed-app-1",
      });
      expect(
        missingWorkspaceMutationRequirements(
          [...createChangedWorkspaceResults(), ...results.slice(1)],
          requirements,
        ),
      ).toEqual([]);
    },
  );

  it.each([
    { label: "unmanaged process", session: { managed: false } },
    { label: "exited process", session: { state: "exited" } },
    { label: "closed process", session: { state: "closed" } },
    { label: "missing session identity", session: { id: undefined } },
    { label: "blank session identity", session: { id: " " } },
    { label: "missing launch command", session: { command: undefined } },
    { label: "blank launch command", session: { command: " " } },
    { label: "wrong workspace", session: { cwd: "/workspace/other" } },
    { label: "starting server", data: { status: "starting" } },
    { label: "unhealthy server", data: { status: "unhealthy" } },
    { label: "remote URL", data: { url: "https://example.com/" } },
    { label: "missing URL", data: { url: undefined } },
    {
      label: "credential-bearing URL",
      data: { url: "http://user:password@localhost:3001/" },
    },
  ])("rejects a ready claim with $label", ({ session, data }) => {
    const results = createVerifiedNoopResults().slice(0, 3);
    const server = results[2];
    if (server?.data) {
      server.data = {
        ...server.data,
        ...data,
        session: {
          ...(server.data.session as Record<string, unknown>),
          ...session,
        },
      };
    }
    const requirements = workspaceNoopRequirements(
      "Create a blog app, install with Bun, run a production build, and start the application.",
    );
    expect(
      verifyWorkspaceNoopCompletion(results, requirements),
    ).toBeUndefined();
    expect(
      missingWorkspaceMutationRequirements(
        [...createChangedWorkspaceResults(), ...results.slice(1)],
        requirements,
      ),
    ).toEqual([
      `a ready managed app server with a verified local URL in ${workdir}`,
    ]);
  });

  it("also verifies direct native file mutations against the build receipt", () => {
    const requirements = workspaceNoopRequirements(
      "Update the page and run its production build.",
    );
    const results = [
      {
        success: true,
        data: {
          actionName: "WRITE_FILE",
          mutationAction: "WRITE_FILE",
          mutationKind: "local-file",
          mutation: {
            action: "WRITE_FILE",
            success: true,
            resolvedPath: "/workspace/blog/app/page.tsx",
          },
        },
      },
      {
        success: true,
        data: {
          actionName: "SHELL",
          command: "bun run build",
          exitCode: 0,
          cwd: "/workspace/blog",
        },
      },
    ] as ActionResult[];

    expect(missingWorkspaceMutationRequirements(results, requirements)).toEqual(
      [],
    );
  });

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

  it.each([
    `bun --cwd ${workdir} install && bun run --cwd ${workdir} build`,
    `bun install --cwd=${workdir} --frozen-lockfile && bun --cwd=${workdir} run build`,
  ])(
    "verifies scoped operations without inventing a shell launch cwd: %s",
    (command) => {
      const results = createVerifiedNoopResults();
      const shell = results[1] as ActionResult;
      shell.data = { actionName: "SHELL", command, exitCode: 0 };
      const requirements = workspaceNoopRequirements(
        "Use Bun, build and start the app.",
      );
      expect(hasSuccessfulWorkspaceBuild(results, workdir)).toBe(true);
      expect(
        verifyWorkspaceNoopCompletion(results, requirements),
      ).toBeDefined();
      expect(
        missingWorkspaceMutationRequirements(
          [...createChangedWorkspaceResults(), ...results.slice(1)],
          requirements,
        ),
      ).toEqual([]);
      shell.data.command = `bun --cwd /workspace/other install && bun run --cwd /workspace/other build`;
      shell.data.cwd = workdir;
      expect(hasSuccessfulWorkspaceBuild(results, workdir)).toBe(false);
      expect(
        verifyWorkspaceNoopCompletion(results, requirements),
      ).toBeUndefined();
    },
  );

  it.each(["stopped", "unhealthy"])(
    "invalidates old readiness after a later %s receipt",
    (status) => {
      const results = createVerifiedNoopResults();
      const server = results[2] as ActionResult;
      results.push({
        ...server,
        success: status !== "unhealthy",
        data: { ...server.data, status },
      });
      const requirements = workspaceNoopRequirements(
        "Use Bun, build and start the app.",
      );
      expect(
        verifyWorkspaceNoopCompletion(results, requirements),
      ).toBeUndefined();
      expect(
        missingWorkspaceMutationRequirements(
          [...createChangedWorkspaceResults(), ...results.slice(1)],
          requirements,
        ),
      ).toContain(
        `a ready managed app server with a verified local URL in ${workdir}`,
      );
    },
  );

  it("uses an explicit shell cd target instead of the process launch directory", () => {
    const results = createVerifiedNoopResults();
    expect(hasSuccessfulWorkspaceBuild(results, workdir)).toBe(true);
    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create a blog app, install with Bun, run a production build, and start the application.",
        ),
      ),
    ).toMatchObject({ workdir, bunInstallVerified: true, buildVerified: true });

    const wrongTarget = createVerifiedNoopResults();
    const shellResult = wrongTarget[1];
    if (shellResult?.data) {
      shellResult.data.command =
        "cd /workspace/other && bun install --frozen-lockfile && bun run build";
    }
    expect(hasSuccessfulWorkspaceBuild(wrongTarget, workdir)).toBe(false);
    expect(
      verifyWorkspaceNoopCompletion(
        wrongTarget,
        workspaceNoopRequirements(
          "Create a blog app and run a production build.",
        ),
      ),
    ).toBeUndefined();
  });

  it.each(["failed", "cancelled"])(
    "invalidates stale builds after a %s coding attempt and retains its mutation workspace",
    (status) => {
      const results = createVerifiedNoopResults();
      const attempt = createChangedWorkspaceResults()[0] as ActionResult;
      attempt.success = false;
      const receipt = attempt.data?.delegatedExecution as Record<
        string,
        unknown
      >;
      receipt.status = status;
      results.push(attempt);
      expect(hasSuccessfulWorkspaceBuild(results, workdir)).toBe(false);
      const requirements = workspaceNoopRequirements(
        "Use Bun, build and start the app.",
      );
      expect(
        missingWorkspaceMutationRequirements([attempt], requirements),
      ).toContain(`a successful production build in ${workdir}`);
      results.push(createVerifiedNoopResults()[1] as ActionResult);
      expect(hasSuccessfulWorkspaceBuild(results, workdir)).toBe(true);
      expect(
        verifyWorkspaceNoopCompletion(results, requirements),
      ).toBeUndefined();
    },
  );

  it("invalidates parent verification after a later coding attempt without new changes", () => {
    const results = [
      ...createChangedWorkspaceResults(),
      ...createVerifiedNoopResults().slice(1),
    ];
    const later = createVerifiedNoopResults()[0] as ActionResult;
    later.success = false;
    (later.data?.delegatedExecution as Record<string, unknown>).status =
      "failed";
    results.push(later);
    expect(
      missingWorkspaceMutationRequirements(
        results,
        workspaceNoopRequirements("Use Bun, build and start the app."),
      ),
    ).toContain(`a successful production build in ${workdir}`);
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

  it("accepts the managed server's successful HTTP readiness probe without a duplicate curl", () => {
    const results = createVerifiedNoopResults().slice(0, 3);
    const contract = buildTurnExecutionContract({
      userRequest: "Create a blog app, build it, and start the application.",
      actionResults: results,
    });

    expect(
      assessTurnExecutionContract({ contract, actionResults: results }),
    ).toEqual({ ok: true });
    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create a blog app, build it, and start the application.",
        ),
      ),
    ).toMatchObject({
      workdir,
      buildVerified: true,
      url: previewUrl,
    });
  });

  it("does not treat a starting server as an HTTP readiness probe", () => {
    const results = createVerifiedNoopResults().slice(0, 3);
    const server = results[2];
    if (server?.data) {
      server.data = { ...server.data, status: "starting", url: undefined };
    }
    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create a blog app, build it, and start the application.",
        ),
      ),
    ).toBeUndefined();
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

  it("keeps a blocked duplicate delegation from invalidating a verified no-op", () => {
    const results = createVerifiedNoopResults().slice(0, 3);
    results.splice(1, 0, {
      success: true,
      text: "A duplicate same-workspace delegation was blocked.",
      continueChain: false,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        duplicateDelegationPrevented: {
          status: "blocked",
          workdir,
          previousSessionId: "coding-agent-1",
        },
      },
    } as ActionResult);

    expect(
      verifyWorkspaceNoopCompletion(
        results,
        workspaceNoopRequirements(
          "Create a blog app, install with Bun, run a production build, and start the application.",
        ),
      ),
    ).toMatchObject({
      workdir,
      bunInstallVerified: true,
      buildVerified: true,
      url: previewUrl,
    });
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
