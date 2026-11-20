import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepositoryMutationResult } from "@doolittle/contracts/repository";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { NativeWorkspaceAdmission } from "../../packages/agent/src/runtime/execution-admission";
import { handleNativeRepositoryMutation } from "../../packages/agent/src/server/routes/native-repository";
import type { RepositoryProcessRunner } from "../../packages/agent/src/services/repository/mutations";
import { RepositoryService } from "../../packages/agent/src/services/repository-service";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const workspace = "/canonical-worktree";
const staged = { type: "stage", workspace, paths: ["fixture.txt"] };

function request(body: Record<string, unknown>) {
  return new Request("http://127.0.0.1/repo/mutate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

it("rejects Git while a workspace turn owns admission and retains the Git lease through settlement", async () => {
  let settle!: (value: RepositoryMutationResult) => void;
  const pending = new Promise<RepositoryMutationResult>((resolve) => {
    settle = resolve;
  });
  const mutate = vi.fn(() => pending);
  const context = {
    config: { workspaceDir: workspace },
    services: { repository: { mutate } },
  } as unknown as AppContext;
  const admission = new NativeWorkspaceAdmission(() => true);
  const chat = admission.claim({ runId: "chat", sessionId: "chat" });
  const wasBusy = await handleNativeRepositoryMutation(
    context,
    request(staged),
    admission,
  );
  expect(wasBusy.status).toBe(409);
  expect(await wasBusy.json()).toMatchObject({ code: "workspace_busy" });
  expect(mutate).not.toHaveBeenCalled();
  await chat.release();

  const git = handleNativeRepositoryMutation(
    context,
    request(staged),
    admission,
  );
  await vi.waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      { type: "stage", paths: ["fixture.txt"] },
      { workspaceRoot: workspace, revalidate: expect.any(Function) },
    ),
  );
  expect(() =>
    admission.claim({ runId: "editor", sessionId: "editor" }),
  ).toThrow(/already owns this workspace/);
  settle({
    type: "stage",
    ok: true,
    summary: "Staged",
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
  const receipt = await git;
  expect(receipt.status).toBe(200);
  expect(await receipt.json()).toMatchObject({
    result: { type: "stage", ok: true },
  });
  await admission.claim({ runId: "editor", sessionId: "editor" }).release();
});

it("does not dispatch unconfirmed, foreign, or unsupported native Git requests", async () => {
  const mutate = vi.fn();
  const context = {
    config: { workspaceDir: workspace },
    services: { repository: { mutate } },
  } as unknown as AppContext;
  const admission = new NativeWorkspaceAdmission(() => true);
  for (const [input, status] of [
    [{ ...staged, workspace: "/different-worktree" }, 409],
    [{ type: "discard", workspace, paths: ["fixture.txt"] }, 403],
    [{ type: "push", workspace }, 403],
    [{ type: "worktree-prune", workspace, confirmed: true }, 400],
    [
      {
        type: "remote-add",
        workspace,
        confirmed: true,
        name: "fixture",
        url: "ext::invalid",
      },
      400,
    ],
    [{ ...staged, paths: ["../fixture.txt"] }, 400],
    [{ ...staged, paths: [":(top)*"] }, 400],
  ] as const) {
    const denied = await handleNativeRepositoryMutation(
      context,
      request(input),
      admission,
    );
    expect(denied.status).toBe(status);
  }
  expect(mutate).not.toHaveBeenCalled();
});

it("verifies actual Git worktree identity and rejects copied pointers and nested roots", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-native-git-guard-")),
  );
  const primary = join(root, "primary");
  const linked = join(root, "linked");
  const copied = join(root, "copied");
  mkdirSync(primary);
  mkdirSync(copied);
  const fixtureEnvironment = isolatedRuntimeEnvironment(root);
  const git = (
    cwd: string,
    args: readonly string[],
    env?: Record<string, string | undefined>,
  ) =>
    execFileSync("git", [...args], {
      cwd,
      encoding: "utf8",
      env: { ...fixtureEnvironment, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(primary, ["init", "-q"]);
    git(primary, ["config", "user.name", "Native Fixture"]);
    git(primary, ["config", "user.email", "native-fixture@example.invalid"]);
    writeFileSync(join(primary, "fixture.txt"), "initial\n");
    git(primary, ["add", "fixture.txt"]);
    git(primary, ["commit", "-qm", "Create fixture"]);
    git(primary, ["worktree", "add", "-qb", "native-git-fixture", linked]);
    writeFileSync(join(linked, "fixture.txt"), "edited in linked tree\n");
    writeFileSync(join(copied, ".git"), readFileSync(join(linked, ".git")));
    const nested = join(primary, "nested");
    mkdirSync(nested);

    const runner: RepositoryProcessRunner = async (command, args, options) => {
      expect(command).toBe("git");
      return {
        stdout: git(options.cwd ?? primary, args, options.env),
        stderr: "",
        exitCode: 0,
        durationMs: 0,
        sandbox: "none",
      };
    };
    const dispatch = (worktree: string) =>
      new RepositoryService(worktree, runner).mutate(
        { type: "stage", paths: ["fixture.txt"] },
        { workspaceRoot: worktree, revalidate() {} },
      );
    await expect(dispatch(linked)).resolves.toMatchObject({ ok: true });
    await expect(dispatch(copied)).rejects.toThrow(
      /selected canonical repository worktree/,
    );
    await expect(dispatch(nested)).rejects.toThrow(
      /selected canonical repository worktree/,
    );
    expect(git(linked, ["diff", "--cached", "--name-only"]).trim()).toBe(
      "fixture.txt",
    );
    expect(git(primary, ["diff", "--cached", "--name-only"]).trim()).toBe("");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
