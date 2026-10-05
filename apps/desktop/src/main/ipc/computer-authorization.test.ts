import { describe, expect, it } from "vitest";
import type { BackendManager } from "../backend";
import type { BotProcessRegistry } from "../bot-process-registry";
import { DesktopExecutionAdmission } from "../execution-admission";
import {
  authorizeComputerRequest,
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
    assertAcpWorkspace: (_botId: string, path: string) => {
      if (path !== "/approved") throw new Error("Workspace mismatch.");
      return path;
    },
    backendFor: async (botId: string) => (botId === "writer" ? worker : lead),
  } as unknown as BotProcessRegistry;
}

describe("Computer bot authorization", () => {
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
        mutationRoot: workspace,
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
