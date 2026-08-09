import { describe, expect, it } from "vitest";
import type { BackendManager } from "../backend";
import {
  registerRepositoryIpcHandlers,
  validateRepositoryMutationRequest,
  validateWorktreeCreateRequest,
} from "./repository";

describe("repository IPC handlers", () => {
  function createHarness(options: {
    confirmed: boolean;
    fetch?: typeof fetch;
  }) {
    const handlers = new Map<
      string,
      (event: unknown, request: unknown) => unknown
    >();
    const confirmations: unknown[] = [];
    registerRepositoryIpcHandlers({
      backend: {
        getState: () => ({
          phase: "ready" as const,
          url: "http://127.0.0.1:4555",
          message: "ready",
        }),
      } as Pick<BackendManager, "getState">,
      confirmSensitiveAction: async (request) => {
        confirmations.push(request);
        return options.confirmed;
      },
      sensitiveFetch: options.fetch ?? fetch,
      registerHandler: (channel, handler) =>
        handlers.set(
          channel,
          handler as unknown as (event: unknown, request: unknown) => unknown,
        ),
    });
    return { handlers, confirmations };
  }

  it("strictly validates worktree and typed repository mutation requests", () => {
    expect(
      validateWorktreeCreateRequest({
        branch: "feature/desktop-worktree",
        path: ".worktrees/desktop-worktree",
      }),
    ).toEqual({
      branch: "feature/desktop-worktree",
      path: ".worktrees/desktop-worktree",
    });
    for (const request of [
      { branch: "--detach", path: ".worktrees/escape" },
      { branch: "feature/../escape", path: ".worktrees/escape" },
      { branch: "feature/escape", path: "../escape" },
      { branch: "feature/escape", path: ".git/worktrees/escape" },
    ]) {
      expect(() => validateWorktreeCreateRequest(request)).toThrow();
    }

    expect(
      validateRepositoryMutationRequest({
        type: "commit",
        message: "  feat: native Git  ",
        amend: true,
      }),
    ).toEqual({ type: "commit", message: "feat: native Git", amend: true });
    expect(
      validateRepositoryMutationRequest({
        type: "stage",
        paths: ["src/index.ts"],
      }),
    ).toEqual({ type: "stage", paths: ["src/index.ts"] });
    expect(
      validateRepositoryMutationRequest({
        type: "pr-review",
        event: "request-changes",
        body: "Please add the missing regression.",
      }),
    ).toEqual({
      type: "pr-review",
      event: "request-changes",
      body: "Please add the missing regression.",
    });
    for (const request of [
      { type: "commit", message: " " },
      { type: "stage", paths: ["../secret"] },
      { type: "branch-switch", branch: "--detach" },
      { type: "remote-add", name: "origin", url: "\0bad" },
      { type: "pr-review", event: "request-changes" },
      { type: "pr-merge", method: "force" },
      { type: "pr-update" },
      { type: "not-a-git-operation" },
    ]) {
      expect(() => validateRepositoryMutationRequest(request)).toThrow();
    }
  });

  it("does not fetch repository changes when native confirmation is cancelled", async () => {
    let fetches = 0;
    const harness = createHarness({
      confirmed: false,
      fetch: async () => {
        fetches += 1;
        return new Response();
      },
    });

    await expect(
      harness.handlers.get("repository:create-worktree-confirmed")?.(
        {},
        {
          branch: "feature/cancelled",
          path: ".worktrees/cancelled",
        },
      ),
    ).resolves.toEqual({ status: "cancelled" });
    await expect(
      harness.handlers.get("repository:mutate-confirmed")?.(
        {},
        {
          type: "stage",
          paths: ["notes.txt"],
        },
      ),
    ).resolves.toEqual({ status: "cancelled" });
    expect(fetches).toBe(0);
  });

  it("creates worktrees through the confirmed channel", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({
          worktree: {
            path: "/workspace/.worktrees/desktop",
            head: "abc123",
            branch: "feature/desktop",
            detached: false,
            bare: false,
            prunable: false,
          },
        });
      },
    });

    await expect(
      harness.handlers.get("repository:create-worktree-confirmed")?.(
        {},
        {
          branch: "feature/desktop",
          path: ".worktrees/desktop",
        },
      ),
    ).resolves.toEqual({
      status: "created",
      worktree: {
        path: "/workspace/.worktrees/desktop",
        head: "abc123",
        branch: "feature/desktop",
        detached: false,
        bare: false,
        prunable: false,
      },
    });
    expect(requests[0]?.url).toBe(
      "http://127.0.0.1:4555/repo/worktrees/create",
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      branch: "feature/desktop",
      path: ".worktrees/desktop",
    });
    expect(harness.confirmations).toEqual([
      {
        kind: "worktree-create",
        title: "Create Git worktree?",
        message: "feature/desktop",
        detail:
          "Doolittle will create a new branch and worktree at .worktrees/desktop, inside the selected workspace.",
        confirmLabel: "Create worktree",
      },
    ]);
  });

  it("returns only validated repository results and preserves bounded failures", async () => {
    const validResult = {
      type: "stage",
      ok: true,
      summary: "Staged 1 path.",
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
    const harness = createHarness({
      confirmed: true,
      fetch: async (input) => {
        if (String(input).endsWith("/repo/worktrees/create")) {
          return Response.json({ worktree: { path: "/workspace" } });
        }
        return Response.json({ result: validResult });
      },
    });

    await expect(
      harness.handlers.get("repository:mutate-confirmed")?.(
        {},
        {
          type: "stage",
          paths: ["src/index.ts"],
        },
      ),
    ).resolves.toEqual({ status: "completed", result: validResult });
    await expect(
      harness.handlers.get("repository:create-worktree-confirmed")?.(
        {},
        {
          branch: "feature/invalid-response",
          path: ".worktrees/invalid-response",
        },
      ),
    ).rejects.toThrow(/did not confirm the new worktree/iu);

    const malformedResultHarness = createHarness({
      confirmed: true,
      fetch: async () =>
        Response.json({
          result: { ...validResult, type: "unstage" },
        }),
    });
    await expect(
      malformedResultHarness.handlers.get("repository:mutate-confirmed")?.(
        {},
        {
          type: "stage",
          paths: ["src/index.ts"],
        },
      ),
    ).rejects.toThrow(/invalid Git result/iu);

    const errorHarness = createHarness({
      confirmed: true,
      fetch: async () =>
        Response.json({ error: "remote unavailable" }, { status: 502 }),
    });
    await expect(
      errorHarness.handlers.get("repository:mutate-confirmed")?.(
        {},
        {
          type: "stage",
          paths: ["src/index.ts"],
        },
      ),
    ).rejects.toThrow(/Git operation failed: remote unavailable/iu);
  });
});
