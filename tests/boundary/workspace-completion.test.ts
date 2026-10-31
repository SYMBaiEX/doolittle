import type { ActionResult } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  frontendReviewAttempt,
  frontendReviewBlockedByUserConstraint,
  serverStartPolicy,
  unresolvedInteractiveTextBlocker,
} from "../../packages/agent/src/runtime/chat-turn/frontend-review";
import {
  collectProviderActionResults,
  completedManagedAppServerSummary,
  mergeActionResults,
} from "../../packages/agent/src/runtime/chat-turn/provider-receipts";
import {
  explicitlyReportsIncompleteWork,
  hasPostAdmissionWorkspaceVerification,
  incompleteVerificationScopes,
} from "../../packages/agent/src/runtime/chat-turn/workspace-continuation";
import {
  admittedWorkspace,
  hasVerifiedWorkspaceMutation,
  missingWorkspaceMutationRequirements,
  verifyWorkspaceNoopCompletion,
} from "../../packages/agent/src/runtime/chat-turn/workspace-evidence";
import type { WorkspaceNoopRequirements } from "../../packages/agent/src/runtime/chat-turn/workspace-noop-completion";
import {
  recordScopedTurnActionResult,
  runWithTurnRuntimeScope,
} from "../../packages/agent/src/runtime/turn-runtime-scope";

const workdir = "/workspace/project";
const requirements: WorkspaceNoopRequirements = {
  requireBunInstall: false,
  requireBuild: true,
  requireManagedApplication: true,
};
function action(
  name: string,
  data: Record<string, unknown> = {},
): ActionResult {
  return { success: true, text: name, data: { actionName: name, ...data } };
}
function mutation(path = `${workdir}/src/App.tsx`): ActionResult {
  return action("WRITE_FILE", {
    mutationKind: "local-file",
    mutationAction: "WRITE_FILE",
    mutation: { action: "WRITE_FILE", success: true, resolvedPath: path },
  });
}
function shell(command: string, directory = workdir): ActionResult {
  return action("SHELL", {
    commandResult: {
      command,
      executedIn: directory,
      success: true,
      exitCode: 0,
    },
  });
}
function ready(): ActionResult {
  return action("DOOLITTLE_APP_SERVER", {
    status: "ready",
    url: "http://127.0.0.1:3000",
    session: {
      id: "app",
      cwd: workdir,
      managed: true,
      state: "running",
      command: "npm run dev",
    },
  });
}
function review(): ActionResult {
  return action("DOOLITTLE_BROWSER_ANALYZE", {
    reviewAttempted: true,
    reviewedUrl: "http://127.0.0.1:3000",
    modelEvidence: "text-only",
  });
}

describe("workspace completion across SDK turns", () => {
  it("requires a rebuild and fresh browser review after a later edit", () => {
    const inspected = review();
    const results = [mutation(), shell("npm run build"), ready(), inspected];
    expect(missingWorkspaceMutationRequirements(results, requirements)).toEqual(
      [],
    );
    expect(
      frontendReviewAttempt(results, requirements, "Fix the website"),
    ).toBe(inspected);
    const changed = [...results, mutation()];
    expect(
      missingWorkspaceMutationRequirements(changed, requirements).length,
    ).toBeGreaterThan(0);
    expect(
      frontendReviewAttempt(changed, requirements, "Fix the website"),
    ).toBeUndefined();
    const rebuilt = [...changed, shell("npm run build"), ready()];
    expect(
      frontendReviewAttempt(rebuilt, requirements, "Fix the website"),
    ).toBeUndefined();
    const reinspected = review();
    expect(
      frontendReviewAttempt(
        [...rebuilt, reinspected],
        requirements,
        "Fix the website",
      ),
    ).toBe(reinspected);
  });

  it("clears captured readability blockers only after correction and qualified fresh evidence", () => {
    const viewport = { width: 1280, height: 720 };
    const subject = {
      viewport,
      candidateIndex: 0,
      pngSha256: "a".repeat(64),
      subjectSha256: "b".repeat(64),
    };
    const evidence = [viewport, { width: 390, height: 844 }].map((size) => ({
      viewport: size,
      captureMode: "rendered-page",
      captureReady: true,
      blockedRequests: 0,
      pixels: { sha256: subject.pngSha256 },
    }));
    const visualReview = (blocked: boolean) =>
      action("DOOLITTLE_BROWSER_ANALYZE", {
        reviewAttempted: true,
        reviewedUrl: "http://127.0.0.1:3000",
        modelEvidence: "rendered-pixels",
        evidence,
        interactiveTextCheck: {
          version: 1,
          status: blocked ? "blocked" : "no-blocker-detected",
          blockersTruncated: false,
          blockers: blocked
            ? [{ ...subject, code: "equal-solid-interactive-text-colors" }]
            : [],
          clearances: blocked ? [] : [subject],
        },
      });
    const results = [
      mutation(),
      shell("npm run build"),
      ready(),
      visualReview(true),
    ];
    const blocked = (receipts: ActionResult[]) =>
      unresolvedInteractiveTextBlocker(
        receipts,
        requirements,
        "Fix the website",
      );
    expect(blocked(results)).toBe(true);
    expect(blocked([...results, visualReview(false)])).toBe(true);
    const corrected = [...results, mutation(), shell("npm run build"), ready()];
    expect(blocked([...corrected, review()])).toBe(true);
    expect(blocked([...corrected, visualReview(false)])).toBe(false);
  });

  it("honors a server prohibition without treating quoted text as authorization", () => {
    const request =
      'Fix the website. Do not start a server. The log says "start the app".';
    expect(serverStartPolicy(request).forbidden).toBe(true);
    expect(
      frontendReviewBlockedByUserConstraint(
        [mutation()],
        requirements,
        request,
      ),
    ).toBe(true);
    expect(serverStartPolicy(`${request} Now start the app.`).forbidden).toBe(
      false,
    );
    expect(
      serverStartPolicy('The log says "do not start a server". Start the app.')
        .forbidden,
    ).toBe(false);
  });

  it("requires each named check to pass again in the admitted workspace", () => {
    const results = [mutation(`${workdir}/server.ts`), shell("npm run lint")];
    const passes = (extra: ActionResult[]) =>
      hasPostAdmissionWorkspaceVerification(
        [...results, ...extra],
        results.length,
        "checks",
        requirements,
        'Run "lint" and typecheck.',
        workdir,
      );
    expect(passes([shell("npm run lint")])).toBe(false);
    expect(
      passes([
        shell("npm run lint"),
        shell("npm run typecheck", "/workspace/other"),
      ]),
    ).toBe(false);
    expect(passes([shell("npm run lint"), shell("npm run typecheck")])).toBe(
      true,
    );
    expect(
      passes([
        shell("npm run lint"),
        shell("npm run typecheck"),
        mutation(`${workdir}/server.ts`),
      ]),
    ).toBe(false);
  });

  it("accepts fresh Nub checks without substituting a smaller check for the requested gate", () => {
    const results = [
      mutation(`${workdir}/server.ts`),
      shell("nub run check:release"),
    ];
    const passes = (extra: ActionResult[]) =>
      hasPostAdmissionWorkspaceVerification(
        [...results, ...extra],
        results.length,
        "checks",
        requirements,
        "Run nub run check:release.",
        workdir,
      );
    expect(passes([shell("nub run check")])).toBe(false);
    expect(passes([shell("nub run check:release", "/workspace/other")])).toBe(
      false,
    );
    expect(passes([shell("nub run check:release")])).toBe(true);
  });

  it("keeps unfinished implementation stronger than unfinished verification", () => {
    expect(
      explicitlyReportsIncompleteWork(
        "I still need to fix the bug and run tests.",
      ),
    ).toBe("implementation");
    expect(
      explicitlyReportsIncompleteWork("I have not rerun the build and tests."),
    ).toBe("verification");
    expect([
      ...incompleteVerificationScopes("I have not rerun the build and tests."),
    ]).toEqual(["build", "tests"]);
    expect(
      explicitlyReportsIncompleteWork("The build and tests passed."),
    ).toBeUndefined();
  });

  it("rejects sibling-directory mutation evidence when pinning the workspace", () => {
    const results = [mutation("/workspace/project-other/server.ts")];
    expect(hasVerifiedWorkspaceMutation(results, workdir)).toBe(false);
    expect(admittedWorkspace(results, workdir)).toBe(
      "/workspace/project-other",
    );
  });

  it("restores omitted delegation evidence before parent verification without duplicates", () => {
    const runtime = { getSetting: () => undefined };
    runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      () => {
        const delegated = action("TASKS_SPAWN_AGENT", {
          delegatedExecution: {
            sessionId: "worker",
            workdir,
            status: "completed",
            stopReason: "end_turn",
            exitCode: 0,
            verifiedLocalMutation: false,
            changedFiles: [],
            summary: "No changes were needed.",
          },
        });
        const built = shell("bun run build");
        const server = ready();
        for (const result of [delegated, built, server])
          recordScopedTurnActionResult(runtime, result);
        const projected = [action("TASKS_SPAWN_AGENT"), built, server];
        const results = collectProviderActionResults(runtime, [], projected);
        expect(results).toEqual([delegated, built, server]);
        expect(
          verifyWorkspaceNoopCompletion(results, requirements),
        ).toMatchObject({ workdir, buildVerified: true });
        const stopped = action("DOOLITTLE_APP_SERVER", {
          status: "stopped",
          session: { id: "app", cwd: workdir, managed: true },
        });
        recordScopedTurnActionResult(runtime, stopped);
        const recovered = collectProviderActionResults(runtime, results, [
          stopped,
        ]);
        expect(recovered).toEqual([delegated, built, server, stopped]);
        expect(
          verifyWorkspaceNoopCompletion(recovered, requirements),
        ).toBeUndefined();
      },
    );
  });

  it("does not advertise a stopped managed app as ready during provider recovery", () => {
    const server = ready();
    const stopped = action("DOOLITTLE_APP_SERVER", {
      status: "stopped",
      session: { id: "app", cwd: workdir, managed: true },
    });
    expect(completedManagedAppServerSummary([server])).toContain(
      "Managed application ready",
    );
    expect(completedManagedAppServerSummary([server, stopped])).toBeUndefined();
    expect(
      completedManagedAppServerSummary([
        server,
        { ...stopped, success: false },
      ]),
    ).toBeUndefined();
    expect(
      completedManagedAppServerSummary([server, stopped, ready()]),
    ).toContain("Managed application ready");
  });

  it("recovers full receipts without collapsing repeated readiness observations", () => {
    const runtime = { getSetting: () => undefined };
    runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      () => {
        const changed = mutation();
        const built = shell("npm run build");
        const firstReady = ready();
        const firstReview = review();
        const secondReady = ready();
        const secondReview = review();
        const originals = [
          changed,
          built,
          firstReady,
          firstReview,
          secondReady,
          secondReview,
        ];
        for (const result of originals)
          recordScopedTurnActionResult(runtime, result);
        const projections: ActionResult[] = JSON.parse(
          JSON.stringify(originals),
        );
        const results = collectProviderActionResults(runtime, [], projections);
        expect(results).toEqual(originals);
        expect(results[2]).toBe(firstReady);
        expect(results[4]).toBe(secondReady);
        expect(
          frontendReviewAttempt(results, requirements, "Fix the website"),
        ).toBe(secondReview);
        const unidentified = ready();
        const merged = mergeActionResults(runtime, results, [unidentified]);
        expect(merged.at(-1)?.data?.doolittleReceiptChronologyUnverified).toBe(
          true,
        );
        expect(
          frontendReviewAttempt(merged, requirements, "Fix the website"),
        ).toBeUndefined();
      },
    );
  });
});
