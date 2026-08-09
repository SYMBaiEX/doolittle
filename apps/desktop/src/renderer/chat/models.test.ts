import { describe, expect, it } from "vitest";
import type { DesktopRunUpdate } from "../../shared/contracts";
import {
  attachmentSize,
  fileName,
  isDesktopRunUpdate,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
  runEventCopy,
  runEventKey,
} from "./models";

function update(
  type: DesktopRunUpdate["type"],
  overrides: Partial<DesktopRunUpdate["run"]> = {},
): DesktopRunUpdate {
  return {
    type,
    sessionId: "session-1",
    run: {
      runId: "run-1",
      sessionId: "session-1",
      roomId: "room-1",
      source: "desktop",
      message: "Review this",
      runDepth: "standard",
      configuredMaxIterations: 8,
      observedActionCount: 1,
      progressMode: "all",
      status: "complete",
      localMutations: [],
      pendingApprovals: 0,
      startedAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T10:00:01.000Z",
      ...overrides,
    },
  };
}

describe("chat presentation models", () => {
  it("keeps composer attachment limits in the shared model surface", () => {
    expect(MAX_MESSAGE_ATTACHMENTS).toBe(8);
    expect(MAX_MESSAGE_ATTACHMENT_BYTES).toBe(50 * 1024 * 1024);
  });

  it("formats filenames and attachment sizes for transcript labels", () => {
    expect(fileName("/workspace/docs/brief.md")).toBe("brief.md");
    expect(fileName("C:\\workspace\\brief.md")).toBe("brief.md");
    expect(attachmentSize(900)).toBe("900 B");
    expect(attachmentSize(2048)).toBe("2 KB");
    expect(attachmentSize(1_572_864)).toBe("1.5 MB");
  });

  it("validates run updates and preserves a stable event key", () => {
    const value = update("action-completed", { lastAction: "READ_FILE" });
    expect(isDesktopRunUpdate(value)).toBe(true);
    expect(isDesktopRunUpdate({ type: "completed", run: {} })).toBe(false);
    expect(runEventKey(value)).toContain("action-completed");
    expect(runEventKey(value)).toContain("READ_FILE");
  });

  it("describes local mutation outcomes with safe path labels", () => {
    const value = update("local-mutation", {
      status: "acting",
      localMutations: [
        {
          action: "write_file",
          requestedPath: "docs/brief.md",
          resolvedPath: "/workspace/docs/brief.md",
          success: true,
          bytes: 42,
          recordedAt: "2026-08-09T10:00:01.000Z",
        },
      ],
    });
    expect(runEventCopy(value)).toEqual({
      label: "Workspace changed",
      detail: "write_file · brief.md · 42 bytes",
      tone: "good",
    });
  });
});
