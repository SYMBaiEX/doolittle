import { expect, it } from "vitest";
import { firstPrivateBotDraft } from "../../apps/desktop/src/renderer/bots/bot-selection";
import {
  extendHistoryPage,
  refreshHistoryPage,
} from "../../apps/desktop/src/renderer/chat/history-pagination";
import { queueHeadStatus } from "../../apps/desktop/src/renderer/chat/queue-status";
import type { SessionSummary } from "../../apps/desktop/src/shared/contracts";

it("finds the first private draft for the same agent without crossing project, bot, or saved history", () => {
  const draft = { text: "A first message", capsule: null, attachments: [] };
  const input = {
    botId: "scout",
    defaultBotId: "lead",
    drafts: {
      scratch: draft,
      project: draft,
      lead: draft,
      unbound: draft,
      foreign: draft,
    },
    sessions: [] as SessionSummary[],
    botBindings: {
      scratch: "scout",
      project: "scout",
      lead: "lead",
      unbound: "scout",
      foreign: "scout",
    },
    projectBindings: {
      scratch: null,
      project: "repo",
      lead: null,
      foreign: null,
    },
  };
  const known = {
    sessionId: "foreign",
    botId: "lead",
    messageCount: 0,
    participants: [],
    preview: [],
  };
  expect(firstPrivateBotDraft({ ...input, sessions: [known] })).toBe("scratch");
  expect(
    firstPrivateBotDraft({
      ...input,
      sessions: [
        known,
        { ...known, sessionId: "sent", botId: "scout", messageCount: 1 },
      ],
    }),
  ).toBeUndefined();
});

it("keeps the contiguous older transcript and advances its offset after a new turn", () => {
  const original = {
    messageIds: ["3", "4", "5"],
    hasEarlier: true,
    nextOffset: 3,
    totalMessages: 6,
  };
  const earlier = {
    messageIds: ["0", "1", "2"],
    hasEarlier: false,
    nextOffset: 6,
    totalMessages: 6,
  };
  const latest = {
    messageIds: ["5", "6", "7"],
    hasEarlier: true,
    nextOffset: 3,
    totalMessages: 8,
  };
  const refreshed = refreshHistoryPage(
    extendHistoryPage(original, earlier),
    latest,
  );
  expect([...refreshed.retainIds]).toEqual(["0", "1", "2", "3", "4"]);
  expect(refreshed.page).toEqual({
    messageIds: ["0", "1", "2", "3", "4", "5", "6", "7"],
    hasEarlier: false,
    nextOffset: 8,
    totalMessages: 8,
  });
});

it("uses the runtime's replacement page after a history reset or compaction", () => {
  const original = {
    messageIds: ["0", "1", "2", "3", "4"],
    hasEarlier: false,
    nextOffset: 5,
    totalMessages: 5,
  };
  for (const latest of [
    {
      messageIds: ["reset", "new"],
      hasEarlier: false,
      nextOffset: 2,
      totalMessages: 2,
    },
    {
      messageIds: ["3", "4", "5"],
      hasEarlier: true,
      nextOffset: 3,
      totalMessages: 4,
    },
  ]) {
    expect(refreshHistoryPage(original, latest)).toEqual({
      page: latest,
      retainIds: new Set(),
    });
  }
});

it("explains the global FIFO delay to a chat that doesn't own the head", () => {
  const input = {
    otherConversation: true,
    workspaceStatus: "ready",
    paused: false,
    runtimeReady: true,
    hydration: "ready",
    busy: false,
  } as const;
  expect(queueHeadStatus({ ...input, busy: true })).toContain("another chat");
  expect(queueHeadStatus({ ...input, paused: true })).toContain("paused");
  expect(
    queueHeadStatus({ ...input, workspaceStatus: "legacy-unbound" }),
  ).toContain("Remove it");
  expect(queueHeadStatus({ ...input, hydration: "unavailable" })).toContain(
    "Retry",
  );
  expect(queueHeadStatus({ ...input, otherConversation: false })).toBe("");
});
