import { execFileSync, spawnSync } from "node:child_process";
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

it("refreshes conflict state after a failed merge and continues after a confirmed resolution", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-git-conflict-")),
  );
  const fixtureEnvironment = isolatedRuntimeEnvironment(root);
  const git = (args: readonly string[]) =>
    execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      env: fixtureEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init", "-qb", "main"]);
    git(["config", "user.name", "Native Fixture"]);
    git(["config", "user.email", "native-fixture@example.invalid"]);
    git(["config", "commit.gpgsign", "false"]);
    writeFileSync(join(root, "fixture.txt"), "initial\n");
    git(["add", "fixture.txt"]);
    git(["commit", "-qm", "Initial commit"]);
    git(["switch", "-qc", "side"]);
    writeFileSync(join(root, "fixture.txt"), "side\n");
    git(["commit", "-qam", "Side commit"]);
    git(["switch", "-q", "main"]);
    writeFileSync(join(root, "fixture.txt"), "main\n");
    git(["commit", "-qam", "Main commit"]);

    const runner: RepositoryProcessRunner = async (command, args, options) => {
      const result = spawnSync(command, [...args], {
        cwd: options.cwd,
        encoding: "utf8",
        env: { ...fixtureEnvironment, ...options.env },
      });
      if (result.error) throw result.error;
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status ?? 1,
        durationMs: 0,
        sandbox: "none",
      };
    };
    const service = new RepositoryService(root, runner);
    const context = {
      config: { workspaceDir: root },
      services: { repository: service },
    } as unknown as AppContext;
    const admission = new NativeWorkspaceAdmission(() => true);
    const operation = (body: Record<string, unknown>) =>
      handleNativeRepositoryMutation(
        context,
        request({ ...body, workspace: root }),
        admission,
      );

    expect(await service.conflicts()).toEqual([]);
    expect((await service.summary()).operation).toBeUndefined();
    expect(
      await (
        await operation({ type: "merge", branch: "side", confirmed: true })
      ).json(),
    ).toMatchObject({ result: { ok: false, type: "merge" } });
    expect((await service.summary()).operation).toBe("merge");
    expect(await service.conflicts()).toEqual([
      { path: "fixture.txt", stages: ["1", "2", "3"] },
    ]);

    writeFileSync(join(root, "fixture.txt"), "resolved\n");
    expect(
      await (
        await operation({
          type: "conflict-mark-resolved",
          paths: ["fixture.txt"],
          confirmed: true,
        })
      ).json(),
    ).toMatchObject({ result: { ok: true } });
    expect(await service.conflicts()).toEqual([]);
    expect((await operation({ type: "merge-continue" })).status).toBe(403);
    expect(
      await (
        await operation({ type: "merge-continue", confirmed: true })
      ).json(),
    ).toMatchObject({ result: { ok: true, type: "merge-continue" } });
    expect((await service.summary()).operation).toBeUndefined();
    expect(git(["show", "HEAD:fixture.txt"])).toBe("resolved\n");
    expect(
      git(["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(" "),
    ).toHaveLength(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("targets confirmed GitHub writes at the reviewed origin, PR and commit", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-native-pr-")),
  );
  const fixtureEnvironment = isolatedRuntimeEnvironment(root);
  const result = {
    stdout: "",
    stderr: "",
    exitCode: 0,
    durationMs: 0,
    sandbox: "none",
  } as const;
  const head = "0123456789abcdef0123456789abcdef01234567";
  const origin = "https://github.com/fixture-owner/fixture-repo";
  const pullRequestUrl = `${origin}/pull/42`;
  const network = vi.fn();
  const git = (args: readonly string[]) =>
    execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      env: fixtureEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init", "-qb", "feature"]);
    git(["remote", "add", "origin", `${origin}.git`]);
    const runner: RepositoryProcessRunner = async (command, args, options) => {
      if (command === "gh") {
        network(args, options.env);
        return result;
      }
      return { ...result, stdout: git(args) };
    };
    const context = {
      config: { workspaceDir: root },
      services: { repository: new RepositoryService(root, runner) },
    } as unknown as AppContext;
    const admission = new NativeWorkspaceAdmission(() => true);
    const dispatch = (body: Record<string, unknown>) =>
      handleNativeRepositoryMutation(
        context,
        request({ workspace: root, confirmed: true, ...body }),
        admission,
      );
    const merge = { type: "pr-merge", method: "squash", matchHead: head };

    expect((await dispatch(merge)).status).toBe(400);
    expect(
      (await dispatch({ ...merge, pullRequestUrl, confirmed: false })).status,
    ).toBe(403);
    expect(
      (
        await dispatch({
          ...merge,
          pullRequestUrl: "https://github.com/other/target/pull/42",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await dispatch({
          ...merge,
          pullRequestUrl:
            "https://github.com.example/fixture-owner/fixture-repo/pull/42",
        })
      ).status,
    ).toBe(400);
    expect(network).not.toHaveBeenCalled();

    expect(
      await (await dispatch({ ...merge, pullRequestUrl })).json(),
    ).toMatchObject({ result: { ok: true } });
    expect(network).toHaveBeenCalledWith(
      ["pr", "merge", pullRequestUrl, "--squash", "--match-head-commit", head],
      expect.objectContaining({ GH_PROMPT_DISABLED: "1" }),
    );

    const create = {
      type: "pr-create",
      repository: "fixture-owner/fixture-repo",
      head: "feature",
      title: "Fixture PR",
      draft: true,
    };
    expect((await dispatch({ ...create, head: "stale-branch" })).status).toBe(
      400,
    );
    expect(await (await dispatch(create)).json()).toMatchObject({
      result: { ok: true },
    });
    expect(network).toHaveBeenLastCalledWith(
      [
        "pr",
        "create",
        "--repo",
        "github.com/fixture-owner/fixture-repo",
        "--head",
        "feature",
        "--title",
        "Fixture PR",
        "--body",
        "",
        "--draft",
      ],
      expect.objectContaining({ GH_PROMPT_DISABLED: "1" }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
