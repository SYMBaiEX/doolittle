import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendLaunchTarget } from "./backend";
import { BotKnowledgeBroker } from "./bot-knowledge-broker";
import type { BotProcessRegistry } from "./bot-process-registry";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function harness() {
  const dataDir = mkdtempSync(resolve(tmpdir(), "doolittle-knowledge-test-"));
  directories.push(dataDir);
  const members = new Map([
    ["source", "project-1"],
    ["target", "project-1"],
  ]);
  const add = vi.fn(async () => "00000000-0000-4000-8000-000000000002");
  const read = vi.fn(async () => "An explicitly selected message.");
  const documents = { add, read, stop: vi.fn(async () => undefined) };
  const bots = {
    get: (id: string) => ({
      id,
      agentId: `${id}-agent`,
      isDefault: false,
      projectId: members.get(id),
    }),
    ensureConversationOwner: async () => ({
      sessionId: "source-session",
      projectId: "project-1",
    }),
    assertRunOwner: async () => undefined,
    conversations: { getRun: () => ({ sessionId: "source-session" }) },
    backendFor: async () => ({
      getState: () => ({ url: "http://source.local" }),
    }),
  } as unknown as BotProcessRegistry;
  const fetcher = vi.fn(async () =>
    Response.json({
      throughRunId: "source-run",
      messages: [
        {
          id: "message-1",
          role: "assistant",
          text: "An explicitly selected message.",
        },
      ],
    }),
  ) as unknown as typeof fetch;
  const broker = new BotKnowledgeBroker(
    bots,
    {} as BackendLaunchTarget,
    dataDir,
    fetcher,
    documents,
  );
  return { broker, members, add, read, fetcher };
}

describe("broker-only knowledge grants", () => {
  it("promotes only the selected exact run message, then retrieves only after current membership grant", async () => {
    const { broker, add, read } = harness();
    const input = {
      sourceBotId: "source",
      sessionId: "source-session",
      runId: "source-run",
      messageId: "message-1",
      projectId: "project-1",
      title: "Selected finding",
      consent: true as const,
    };
    const record = await broker.promote(input);
    expect(record.source).toMatchObject({
      botId: "source",
      messageId: "message-1",
      runId: "source-run",
    });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ content: "An explicitly selected message." }),
    );
    const selection = {
      originBotId: "source",
      originProjectId: "project-1",
      targetBotId: "target",
      knowledgeIds: [record.id],
    };
    await expect(broker.retrieveForConsultation(selection)).rejects.toThrow(
      "grant",
    );
    expect(read).not.toHaveBeenCalled();
    broker.grant(record.id, "target", true);
    expect(await broker.retrieveForConsultation(selection)).toEqual([
      {
        id: record.id,
        title: record.title,
        text: "An explicitly selected message.",
      },
    ]);
    broker.revoke(record.id, "target");
    await expect(broker.retrieveForConsultation(selection)).rejects.toThrow(
      "grant",
    );
  });

  it("denies moved members, omitted consent, or an unselected source without reading private memory", async () => {
    const { broker, members, add, read } = harness();
    await expect(
      broker.promote({
        sourceBotId: "source",
        sessionId: "source-session",
        runId: "source-run",
        messageId: "wrong",
        projectId: "project-1",
        title: "Finding",
        consent: true,
      }),
    ).rejects.toThrow("Selected source");
    expect(add).not.toHaveBeenCalled();
    const record = await broker.promote({
      sourceBotId: "source",
      sessionId: "source-session",
      runId: "source-run",
      messageId: "message-1",
      projectId: "project-1",
      title: "Finding",
      consent: true,
    });
    expect(() => broker.grant(record.id, "target", false)).toThrow("consent");
    broker.grant(record.id, "target", true);
    members.set("target", "project-2");
    await expect(
      broker.retrieveForConsultation({
        originBotId: "source",
        originProjectId: "project-1",
        targetBotId: "target",
        knowledgeIds: [record.id],
      }),
    ).rejects.toThrow("current project");
    expect(read).not.toHaveBeenCalled();
  });
});
