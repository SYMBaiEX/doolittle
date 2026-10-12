import { describe, expect, it, vi } from "vitest";
import type { BackendManager } from "../backend";
import type { BotProcessRegistry } from "../bot-process-registry";
import { DesktopExecutionAdmission } from "../execution-admission";
import {
  authorizeComputerRequest,
  isWorkspaceTransportMutation,
  validateComputerOwnerScope,
} from "./computer-authorization";

const lead = {
  getState: () => ({ phase: "ready", url: "http://lead" }),
} as BackendManager;
const worker = {
  getState: () => ({ phase: "ready", url: "http://worker" }),
} as BackendManager;
const scope = {
  botId: "writer",
  originConversationId: "session-1",
  workspacePath: "/approved",
};

function registry(options: { mutation?: boolean; wrongOwner?: boolean } = {}) {
  return {
    get: (botId: string) => ({
      id: botId,
      permissions: { allowMutation: options.mutation ?? true },
    }),
    ensureConversationOwner: async (botId: string, sessionId: string) => {
      if (
        options.wrongOwner ||
        botId !== "writer" ||
        sessionId !== "session-1"
      ) {
        throw new Error("Conversation belongs to a different bot.");
      }
    },
    assertConversationWorkspace: (
      _botId: string,
      _sessionId: string,
      path: string,
    ) => {
      if (path !== "/approved") throw new Error("Workspace mismatch.");
      return path;
    },
    resolveVerifiedConversationWorkspace: async () => ({
      workspacePath: "/approved",
    }),
    backendFor: async (botId: string) => (botId === "writer" ? worker : lead),
  } as unknown as BotProcessRegistry;
}

describe("Computer bot authorization", () => {
  it("classifies direct checkpoint effects without double-locking run transports", () => {
    expect(isWorkspaceTransportMutation("POST", "/workspace/checkpoints")).toBe(
      true,
    );
    expect(
      isWorkspaceTransportMutation(
        "POST",
        "/workspace/checkpoints/saved/restore",
      ),
    ).toBe(true);
    expect(isWorkspaceTransportMutation("GET", "/workspace/checkpoints")).toBe(
      false,
    );
    expect(isWorkspaceTransportMutation("POST", "/chat/runs")).toBe(false);
    expect(
      isWorkspaceTransportMutation(
        "POST",
        "/workspace/checkpoints/saved/restore/extra",
      ),
    ).toBe(false);
  });
  it("blocks revoked project/task grants and rootless lead changes before effects", async () => {
    const bots = registry();
    const backend = vi.spyOn(bots, "backendFor");
    vi.spyOn(bots, "resolveVerifiedConversationWorkspace").mockRejectedValue(
      new Error("Grant was revoked"),
    );
    await expect(
      authorizeComputerRequest(scope, { backend: lead, bots }, true),
    ).rejects.toThrow("revoked");
    await expect(
      authorizeComputerRequest({}, { backend: lead, bots }, true),
    ).rejects.toThrow("confirmed chat workspace");
    expect(backend).not.toHaveBeenCalled();
  });
  it("requires a complete immutable owner scope", () => {
    expect(validateComputerOwnerScope(scope)).toEqual(scope);
    expect(() => validateComputerOwnerScope({ botId: "writer" })).toThrow();
    expect(() =>
      validateComputerOwnerScope({
        ...scope,
        originConversationId: "../wrong",
      }),
    ).toThrow();
  });

  it("routes an authorized named write to its worker and releases the shared mutation seat", async () => {
    const admission = new DesktopExecutionAdmission();
    const target = await authorizeComputerRequest(
      scope,
      { backend: lead, bots: registry(), admission },
      true,
    );
    expect(target.backend).toBe(worker);
    expect(admission.list()).toMatchObject([
      { botId: "writer", sessionId: "session-1", mutationRoot: "/approved" },
    ]);
    await expect(
      authorizeComputerRequest(
        scope,
        { backend: lead, bots: registry(), admission },
        true,
      ),
    ).rejects.toThrow("mutation_conflict");
    target.release();
    expect(admission.list()).toEqual([]);
  });

  it("denies wrong owner, wrong workspace and read-only grants before selecting any backend", async () => {
    const admission = new DesktopExecutionAdmission();
    await expect(
      authorizeComputerRequest(
        scope,
        { backend: lead, bots: registry({ wrongOwner: true }), admission },
        false,
      ),
    ).rejects.toThrow("different bot");
    await expect(
      authorizeComputerRequest(
        { ...scope, workspacePath: "/other" },
        { backend: lead, bots: registry(), admission },
        true,
      ),
    ).rejects.toThrow("Workspace mismatch");
    await expect(
      authorizeComputerRequest(
        scope,
        { backend: lead, bots: registry({ mutation: false }), admission },
        true,
      ),
    ).rejects.toThrow("not allowed");
    await expect(
      authorizeComputerRequest(scope, { backend: lead }, true),
    ).rejects.toThrow("unavailable");
    expect(admission.list()).toEqual([]);
  });

  it("puts legacy lead writes under the same workspace mutation lock", async () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "doolittle-computer-seat-"),
    );
    try {
      const admission = new DesktopExecutionAdmission();
      const target = await authorizeComputerRequest(
        {},
        {
          backend: lead,
          admission,
          defaultWorkspaceRoot: workspace,
        },
        true,
      );
      expect(admission.list()).toMatchObject([
        { mutationRoot: realpathSync(workspace) },
      ]);
      const competing = admission.claim({
        botId: "other",
        runId: "other-run",
        sessionId: "other-session",
        kind: "foreground",
        // Direct scheduling calls, like production host handlers, supply
        // the already-authorized realpath rather than a symlink alias.
        mutationRoot: realpathSync(workspace),
      });
      expect(competing).toEqual({
        accepted: false,
        reason: "mutation_conflict",
      });
      target.release();
      expect(admission.list()).toEqual([]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
