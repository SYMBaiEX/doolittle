import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InteractiveTerminalSessionManager } from "./session";

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
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for terminal output: ${expected}`);
}

describe("InteractiveTerminalSessionManager", () => {
  it("keeps a PTY shell alive across input, resize, interrupt, and close", async () => {
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

      manager.input(started.id, "sleep 5\n");
      await Bun.sleep(50);
      manager.interrupt(started.id);
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
