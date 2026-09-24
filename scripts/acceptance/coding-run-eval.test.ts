import { describe, expect, it } from "vitest";
import { CODING_EVAL_CASES, evaluateCodingRun } from "./coding-run-eval";

const expectedWorkspace = "/workspace/project";

function delegatedEvent(changedFiles: string[], workdir = expectedWorkspace) {
  return {
    event: "action.completed",
    metadata: {
      action: "TASKS_SPAWN_AGENT",
      actionResult: {
        success: true,
        data: {
          delegatedExecution: {
            workdir,
            status: "completed",
            verifiedLocalMutation: true,
            changedFiles: changedFiles.map((path) => ({ path })),
            summary: "The worker says its build succeeded.",
          },
        },
      },
    },
  };
}

function shellBuild(exitCode: number) {
  return {
    event: "action.completed",
    metadata: {
      action: "SHELL",
      actionResult: {
        success: true,
        data: {
          commandResult: {
            command: "cd /workspace/project && bun run build",
            exitCode,
            success: exitCode === 0,
          },
        },
      },
    },
  };
}

function shellApiSmoke(stdout: string, exitCode = 0) {
  return {
    event: "action.completed",
    metadata: {
      action: "SHELL",
      actionResult: {
        success: true,
        data: {
          commandResult: {
            command:
              "cd /workspace/project && curl -fsS http://localhost:3000/api/state",
            exitCode,
            success: exitCode === 0,
            stdout,
          },
        },
      },
    },
  };
}

function appReadyEvent() {
  return {
    event: "action.completed",
    metadata: {
      action: "DOOLITTLE_APP_SERVER",
      actionResult: {
        success: true,
        data: {
          actionName: "DOOLITTLE_APP_SERVER",
          status: "ready",
          url: "http://localhost:3000",
          session: { cwd: expectedWorkspace, id: "server-1" },
        },
      },
    },
  };
}

function evaluate(
  events: unknown[],
  options: {
    status?: string;
    localMutations?: unknown[];
    expectedWorkspace?: string;
    caseId?: keyof typeof CODING_EVAL_CASES;
  } = {},
) {
  return evaluateCodingRun({
    run: {
      runId: "eval-run",
      status: options.status ?? "complete",
      localMutations: options.localMutations ?? [],
    },
    events,
    expectedWorkspace: options.expectedWorkspace ?? expectedWorkspace,
    evalCase: CODING_EVAL_CASES[options.caseId ?? "coding-change-v1"],
  });
}

describe("coding-run acceptance evals", () => {
  it("passes when source changes, a parent build, and requested app handoff are evidenced", () => {
    const result = evaluate(
      [
        delegatedEvent(["src/app/page.tsx", "package.json"]),
        shellBuild(0),
        appReadyEvent(),
      ],
      { caseId: "coding-app-handoff-v1" },
    );

    expect(result).toMatchObject({
      status: "pass",
      score: 100,
      maxScore: 100,
    });
  });

  it("does not treat a delegated worker's prose build claim as parent verification", () => {
    const result = evaluate([delegatedEvent(["src/app/page.tsx"])]);

    expect(result.status).toBe("fail");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "build", status: "fail" }),
        expect.objectContaining({ id: "acceptance", status: "fail" }),
      ]),
    );
    expect(
      result.checks.find((entry) => entry.id === "build")?.evidence[0],
    ).toContain("delegated agent's prose claim is not build evidence");
  });

  it("fails acceptance when only generated runtime artifacts changed", () => {
    const result = evaluate([], {
      localMutations: [
        {
          action: "WRITE_FILE",
          resolvedPath: "/workspace/project/data.sqlite",
          success: true,
        },
      ],
    });

    expect(
      result.checks.find((entry) => entry.id === "workspace")?.status,
    ).toBe("pass");
    expect(
      result.checks.find((entry) => entry.id === "implementation")?.status,
    ).toBe("fail");
    expect(
      result.checks.find((entry) => entry.id === "acceptance")?.status,
    ).toBe("fail");
  });

  it("rejects source mutations outside the explicitly selected workspace", () => {
    const result = evaluate([
      delegatedEvent(["src/app/page.tsx"], "/workspace/other"),
    ]);

    expect(
      result.checks.find((entry) => entry.id === "workspace")?.status,
    ).toBe("fail");
    expect(result.status).toBe("fail");
  });

  it("accepts a recovered build only when a later parent build exits zero", () => {
    const result = evaluate([
      delegatedEvent(["src/app/page.tsx"]),
      shellBuild(1),
      shellBuild(0),
    ]);

    expect(result.checks.find((entry) => entry.id === "build")?.status).toBe(
      "pass",
    );
    expect(
      result.checks.find((entry) => entry.id === "build")?.evidence,
    ).toContain("Recovered after 1 failed build attempt(s).");
  });

  it("does not accept a successful build from a different working directory", () => {
    const outsideBuild = shellBuild(0);
    outsideBuild.metadata.actionResult.data.commandResult.command =
      "cd /workspace/other && bun run build";
    const result = evaluate([
      delegatedEvent(["src/app/page.tsx"]),
      outsideBuild,
    ]);

    expect(result.checks.find((entry) => entry.id === "build")?.status).toBe(
      "fail",
    );
    expect(
      result.checks.find((entry) => entry.id === "build")?.evidence[0],
    ).toContain("cwd /workspace/other");
  });

  it("requires a ready URL receipt in the same workspace for app-handoff cases", () => {
    const starting = {
      event: "action.completed",
      metadata: {
        action: "DOOLITTLE_APP_SERVER",
        actionResult: {
          success: true,
          data: {
            status: "starting",
            url: "http://localhost:3000",
            session: { cwd: expectedWorkspace, id: "server-1" },
          },
        },
      },
    };
    const result = evaluate(
      [delegatedEvent(["src/app/page.tsx"]), shellBuild(0), starting],
      { caseId: "coding-app-handoff-v1" },
    );

    expect(
      result.checks.find((entry) => entry.id === "app-ready")?.status,
    ).toBe("fail");
    expect(result.status).toBe("fail");
  });

  it("supports starting an already-built app without requiring a new mutation or build", () => {
    const result = evaluate([appReadyEvent()], { caseId: "app-start-v1" });

    expect(result).toMatchObject({ status: "pass", score: 30, maxScore: 30 });
    expect(
      result.checks.find((entry) => entry.id === "workspace")?.status,
    ).toBe("n/a");
    expect(result.checks.find((entry) => entry.id === "build")?.status).toBe(
      "n/a",
    );
  });

  it("requires a fail-on-error JSON API smoke receipt for API runtime fixes", () => {
    const implementation = delegatedEvent(["src/app/api/state/route.ts"]);
    const missingSmoke = evaluate([implementation, shellBuild(0)], {
      caseId: "api-runtime-fix-v1",
    });
    expect(
      missingSmoke.checks.find((entry) => entry.id === "runtime-smoke")?.status,
    ).toBe("fail");

    const passingSmoke = evaluate(
      [implementation, shellBuild(0), shellApiSmoke('{"state":[]}')],
      { caseId: "api-runtime-fix-v1" },
    );
    expect(passingSmoke).toMatchObject({
      status: "pass",
      score: 100,
      maxScore: 100,
    });

    const wrongWorkspaceSmoke = shellApiSmoke('{"state":[]}', 0);
    wrongWorkspaceSmoke.metadata.actionResult.data.commandResult.command =
      "cd /workspace/other && curl -fsS http://localhost:3000/api/state";
    const wrongWorkspace = evaluate(
      [implementation, shellBuild(0), wrongWorkspaceSmoke],
      { caseId: "api-runtime-fix-v1" },
    );
    expect(
      wrongWorkspace.checks.find((entry) => entry.id === "runtime-smoke")
        ?.status,
    ).toBe("fail");
  });
});
