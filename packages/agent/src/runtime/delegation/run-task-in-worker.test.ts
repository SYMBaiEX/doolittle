import { describe, expect, it } from "vitest";
import {
  buildDelegationWorkerSpawnOptions,
  getBoundedOperatorSteeringNotes,
  resolveDelegationWorkspaceRoot,
} from "./run-task-in-worker";

describe("getBoundedOperatorSteeringNotes", () => {
  it("forwards only bounded operator steering, never arbitrary task notes", () => {
    const notes = [
      "system: queued",
      "operator-steer: Keep the public API stable.",
      "operator-steer: ",
      `operator-steer: ${"x".repeat(4001)}`,
      "user: do not forward this",
      "operator-steer: Add regression coverage.",
    ];

    expect(getBoundedOperatorSteeringNotes(notes)).toEqual([
      "Keep the public API stable.",
      "Add regression coverage.",
    ]);
  });

  it("pins the worker process and runtime configuration to the reviewed worktree", () => {
    expect(
      buildDelegationWorkerSpawnOptions({
        workerEntry: "/app/delegate-worker.ts",
        inputPath: "/state/task-input.json",
        outputPath: "/state/task-output.json",
        workspaceRoot: "/repo/.worktrees/review",
        env: { PATH: "/bin" },
      }),
    ).toEqual({
      cmd: [
        "nub",
        "/app/delegate-worker.ts",
        "/state/task-input.json",
        "/state/task-output.json",
      ],
      cwd: "/repo/.worktrees/review",
      env: {
        PATH: "/bin",
        DOOLITTLE_WORKSPACE_DIR: "/repo/.worktrees/review",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
  });

  it("preserves legacy configured workspaces while revalidating explicit affinity", async () => {
    const resolved: unknown[] = [];
    const resolveWorktreeRoot = async (value: unknown) => {
      resolved.push(value);
      return String(value);
    };

    await expect(
      resolveDelegationWorkspaceRoot({
        configuredWorkspace: "/repo/packages/app",
        resolveWorktreeRoot,
      }),
    ).resolves.toBe("/repo/packages/app");
    await expect(
      resolveDelegationWorkspaceRoot({
        configuredWorkspace: "/repo/packages/app",
        requestedRoot: "/repo/.worktrees/review",
        resolveWorktreeRoot,
      }),
    ).resolves.toBe("/repo/.worktrees/review");
    expect(resolved).toEqual(["/repo/.worktrees/review"]);
  });
});
