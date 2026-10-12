import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { runWithConversationWorkspace } from "@/runtime/workspace-scope";
import { InteractiveTerminalSessionManager } from "./session";

function creationId(index: number, timestamp = Date.now()): string {
  return `${timestamp}.00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

async function waitForOutput(
  manager: InteractiveTerminalSessionManager,
  sessionId: string,
  expected: string,
): Promise<string> {
  const deadline = Date.now() + 3_000;
  let output = "";
  let cursor = 0;
  while (Date.now() < deadline) {
    const snapshot = manager.output(sessionId, cursor);
    output += snapshot.chunks.map((chunk) => chunk.data).join("");
    cursor = snapshot.nextCursor;
    if (output.includes(expected)) return output;
    await delay(20);
  }
  throw new Error(`Timed out waiting for terminal output: ${expected}`);
}

describe("InteractiveTerminalSessionManager", () => {
  it("rejects another chat's terminal identity even when both use the same root", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "doolittle-terminal-owner-"));
    const manager = new InteractiveTerminalSessionManager(workspace);
    const scope = (sessionId: string) => ({
      sessionId,
      botId: "bot",
      workspacePath: workspace,
    });
    try {
      const started = await runWithConversationWorkspace(
        scope("chat-a"),
        async () => manager.start(),
      );
      await runWithConversationWorkspace(scope("chat-b"), async () => {
        expect(() => manager.output(started.id)).toThrow("not found");
        expect(() => manager.input(started.id, "whoami\n")).toThrow(
          "not found",
        );
      });
      await runWithConversationWorkspace(scope("chat-a"), async () => {
        expect(manager.output(started.id).session.id).toBe(started.id);
        manager.close(started.id);
      });
    } finally {
      manager.dispose();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("rejects explicit cwd outside the bound root and symlink escapes before spawn", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "doolittle-terminal-root-"));
    const outside = mkdtempSync(join(tmpdir(), "doolittle-terminal-outside-"));
    symlinkSync(outside, join(workspace, "escape"));
    const manager = new InteractiveTerminalSessionManager(workspace);
    try {
      await runWithConversationWorkspace(
        { sessionId: "chat", botId: "bot", workspacePath: workspace },
        async () => {
          expect(() => manager.start({ cwd: outside, command: "pwd" })).toThrow(
            /inside the current workspace/,
          );
          expect(() =>
            manager.start({ cwd: join(workspace, "escape"), command: "pwd" }),
          ).toThrow(/inside the current workspace/);
        },
      );
    } finally {
      manager.dispose();
      rmSync(workspace, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("replays one creation receipt without another PTY and retires closed identities", () => {
    const workspace = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-idempotent-"),
    );
    const manager = new InteractiveTerminalSessionManager(workspace);
    const id = creationId(1);
    try {
      const first = manager.start({ cols: 90, rows: 28, creationId: id });
      expect(manager.start({ cols: 90, rows: 28, creationId: id })).toEqual(
        first,
      );
      expect(() =>
        manager.start({ cols: 91, rows: 28, creationId: id }),
      ).toThrow(/cannot be repeated/iu);
      expect(() =>
        manager.start({ cols: 90, rows: 28, cwd: workspace, creationId: id }),
      ).toThrow(/cannot be repeated/iu);
      manager.close(first.id);
      expect(() =>
        manager.start({ cols: 90, rows: 28, creationId: id }),
      ).toThrow(/cannot be repeated/iu);
      expect(() =>
        manager.start({ creationId: creationId(2, Date.now() + 120_000) }),
      ).toThrow(/cannot be repeated/iu);
      expect(() =>
        manager.start({ creationId: creationId(3, Date.now() - 11 * 60_000) }),
      ).toThrow(/cannot be repeated/iu);
    } finally {
      manager.dispose();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("never evicts an unexpired creation identity to admit a new PTY", () => {
    const workspace = mkdtempSync(join(tmpdir(), "doolittle-terminal-id-cap-"));
    const manager = new InteractiveTerminalSessionManager(workspace);
    const id = creationId(10);
    try {
      const first = manager.start({ creationId: id });
      const creations = (
        manager as unknown as {
          creations: Map<
            string,
            {
              createdAt: number;
              cols: number;
              rows: number;
              sessionId?: string;
            }
          >;
        }
      ).creations;
      for (let index = 11; index < 266; index += 1) {
        creations.set(creationId(index), {
          createdAt: Date.now(),
          cols: 100,
          rows: 30,
        });
      }
      expect(creations.size).toBe(256);
      expect(manager.start({ creationId: id })).toEqual(first);
      expect(() => manager.start({ creationId: creationId(266) })).toThrow(
        /cannot be repeated/iu,
      );
      expect(creations.size).toBe(256);
      expect(manager.output(first.id).session.id).toBe(first.id);
    } finally {
      manager.dispose();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
  it("keeps a native PTY alive across input, resize, and close", async () => {
    const workspace = mkdtempSync(
      join(tmpdir(), "doolittle-interactive-terminal-"),
    );
    const manager = new InteractiveTerminalSessionManager(workspace);

    try {
      const started = manager.start({ cols: 90, rows: 28 });
      expect(started).toMatchObject({
        state: "running",
        cwd: workspace,
        cols: 90,
        rows: 28,
        pty: true,
        supportsResize: true,
      });

      manager.input(started.id, "printf '__DOOLITTLE_PTY_OK__\\n'\n");
      const firstOutput = await waitForOutput(
        manager,
        started.id,
        "__DOOLITTLE_PTY_OK__",
      );
      expect(firstOutput).toContain("__DOOLITTLE_PTY_OK__");

      const resized = manager.resize(started.id, 120, 40);
      expect(resized).toMatchObject({ cols: 120, rows: 40 });

      manager.input(started.id, "printf '__DOOLITTLE_STILL_ALIVE__\\n'\n");
      const resumedOutput = await waitForOutput(
        manager,
        started.id,
        "__DOOLITTLE_STILL_ALIVE__",
      );
      expect(resumedOutput).toContain("__DOOLITTLE_STILL_ALIVE__");

      const closed = manager.close(started.id);
      expect(closed.state).toBe("closed");
      expect(() => manager.input(started.id, "pwd\n")).toThrow(
        "no longer running",
      );
    } finally {
      manager.dispose();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("returns cursor-bounded output snapshots", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "doolittle-terminal-cursor-"));
    const manager = new InteractiveTerminalSessionManager(workspace);

    try {
      const session = manager.start();
      const initial = manager.output(session.id);
      manager.input(session.id, "printf '__CURSOR_BOUNDARY__\\n'\n");
      await waitForOutput(manager, session.id, "__CURSOR_BOUNDARY__");
      const delta = manager.output(session.id, initial.nextCursor);

      expect(delta.nextCursor).toBeGreaterThan(initial.nextCursor);
      expect(delta.chunks.map((chunk) => chunk.data).join("")).toContain(
        "__CURSOR_BOUNDARY__",
      );
    } finally {
      manager.dispose();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
