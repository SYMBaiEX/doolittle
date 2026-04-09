import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalCommandHistoryStore } from "./history";

function createRecord(id: string) {
  return {
    id,
    command: "printf done",
    backend: "local" as const,
    cwd: "/repo",
    exitCode: 0,
    stdout: "done",
    stderr: "",
    startedAt: "2026-03-30T00:00:00.000Z",
    completedAt: "2026-03-30T00:00:00.000Z",
    timedOut: false,
    durationMs: 1,
  };
}

describe("terminal command history", () => {
  it("initializes history and appends command records with a cap", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-history-"));
    const storePath = join(root, "terminal-history.json");

    try {
      const history = new TerminalCommandHistoryStore(storePath);
      expect(history.read().commands).toHaveLength(0);

      const first = history.append(createRecord("first"));
      const second = history.append(createRecord("second"));
      expect(first.commands).toHaveLength(1);
      expect(second.commands).toHaveLength(2);

      const trimmed = new TerminalCommandHistoryStore(storePath);
      trimmed.append(createRecord("third"), 2);
      expect(trimmed.read().commands).toHaveLength(2);
      expect(trimmed.read().commands.at(-1)?.id).toBe("third");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
