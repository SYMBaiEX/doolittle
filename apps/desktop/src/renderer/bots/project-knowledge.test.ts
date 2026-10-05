import { describe, expect, it, vi } from "vitest";
import type { DisplayMessage } from "../chat/models";
import { desktopRequest } from "../eliza-client";
import {
  promoteKnowledgeMessage,
  promoteProjectMessage,
  promotionMessageId,
} from "./project-knowledge";

vi.mock("../eliza-client", () => ({ desktopRequest: vi.fn() }));
const message = {
  id: "assistant:run-1",
  runId: "run-1",
  role: "assistant",
  content: "Selected finding",
  createdAt: "2026-10-04",
} as DisplayMessage;
const boundary = {
  throughRunId: "run-1",
  terminalStatus: "complete",
  throughMessageId: "saved-1",
  messages: [{ id: "saved-1", role: "assistant", text: "Selected finding" }],
};
describe("exact project knowledge promotion", () => {
  it("resolves only a matching canonical message or exact run anchor", () => {
    expect(promotionMessageId(message, boundary)).toBe("saved-1");
    expect(promotionMessageId({ ...message, id: "saved-1" }, boundary)).toBe(
      "saved-1",
    );
    expect(() =>
      promotionMessageId(message, { ...boundary, throughRunId: "other" }),
    ).toThrow();
    expect(() =>
      promotionMessageId(message, { ...boundary, terminalStatus: "cancelled" }),
    ).toThrow();
    expect(() =>
      promotionMessageId(message, { ...boundary, throughMessageId: "other" }),
    ).toThrow();
    expect(() =>
      promotionMessageId({ ...message, content: "Different" }, boundary),
    ).toThrow();
    expect(() =>
      promotionMessageId(
        { ...message, id: "random-local-user", role: "user" },
        boundary,
      ),
    ).toThrow();
  });
  it("captures the source owner for reads and leaves native consent to the global broker", async () => {
    vi.mocked(desktopRequest)
      .mockResolvedValueOnce(boundary)
      .mockResolvedValueOnce({ knowledge: { id: "promoted" } });
    expect(
      await promoteProjectMessage({
        sourceBotId: "source",
        sessionId: "conversation",
        projectId: "project",
        message,
      }),
    ).toEqual({ id: "promoted" });
    expect(desktopRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("throughRunId=run-1"),
      "GET",
      undefined,
      undefined,
      undefined,
      "source",
    );
    expect(desktopRequest).toHaveBeenNthCalledWith(
      2,
      "/bots/knowledge/promote",
      "POST",
      expect.objectContaining({
        sourceBotId: "source",
        sessionId: "conversation",
        projectId: "project",
        messageId: "saved-1",
        consent: true,
      }),
    );
  });
  it("submits exactly one explicit team scope with captured source ownership", async () => {
    vi.mocked(desktopRequest)
      .mockReset()
      .mockResolvedValueOnce(boundary)
      .mockResolvedValueOnce({ knowledge: { id: "team-finding" } });
    await promoteKnowledgeMessage({
      sourceBotId: "source",
      sessionId: "conversation",
      scope: { kind: "team", id: "team" },
      message,
    });
    const body = vi.mocked(desktopRequest).mock.calls[1][2];
    expect(body).toEqual(
      expect.objectContaining({
        sourceBotId: "source",
        sessionId: "conversation",
        teamId: "team",
        consent: true,
      }),
    );
    expect(body).not.toHaveProperty("projectId");
  });
});
