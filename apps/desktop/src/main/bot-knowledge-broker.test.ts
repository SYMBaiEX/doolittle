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
  const teamId = "00000000-0000-4000-8000-000000000003";
  const teamMembers = new Set(["source", "target"]);
  let teamArchived = false;
  const add = vi.fn(async () => "00000000-0000-4000-8000-000000000002");
  const read = vi.fn(async () => "An explicitly selected message.");
  const documents = { add, read, stop: vi.fn(async () => undefined) };
  const bots = {
    teams: {
      assertMember: (id: string, botId: string) => {
        if (id !== teamId || teamArchived || !teamMembers.has(botId))
          throw new Error("Bot is not a current team member.");
      },
    },
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
  return {
    broker,
    members,
    add,
    read,
    fetcher,
    teamMembers,
    teamId,
    archiveTeam: () => {
      teamArchived = true;
    },
  };
}

describe("broker-only knowledge grants", () => {
  it("rejects an SDK content mismatch and ambiguous legacy identity before disclosure", async () => {
    const { broker, read } = harness();
    read.mockResolvedValueOnce("Wrong tail from another scope");
    await expect(
      broker.promote({
        sourceBotId: "source",
        sessionId: "source-session",
        runId: "source-run",
        messageId: "message-1",
        projectId: "project-1",
        title: "Finding",
        consent: true,
      }),
    ).rejects.toThrow("exact selected");
    expect(broker.ledger.list()).toEqual([]);
    read.mockClear();
    vi.spyOn(broker.ledger, "get").mockReturnValue({
      integrity: {
        status: "ambiguous-document",
        message: "Document identity is ambiguous. Re-promote the exact source.",
      },
    } as never);
    await expect(
      broker.retrieveForConsultation({
        originBotId: "source",
        targetBotId: "target",
        originProjectId: "project-1",
        knowledgeIds: ["legacy"],
      }),
    ).rejects.toThrow("ambiguous");
    expect(read).not.toHaveBeenCalled();
  });
  it("uses authoritative team scope while retaining original project provenance", async () => {
    const { broker, teamId, members, add, teamMembers } = harness();
    members.set("target", "another-project");
    const record = await broker.promote({
      sourceBotId: "source",
      sessionId: "source-session",
      runId: "source-run",
      messageId: "message-1",
      teamId,
      title: "Team finding",
      consent: true,
    });
    expect(record.scope).toEqual({ kind: "team", id: teamId });
    expect(record.source.projectId).toBe("project-1");
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "team", id: teamId } }),
    );
    broker.grant(record.id, "target", true);
    expect(
      await broker.retrieveForConsultation({
        originBotId: "source",
        targetBotId: "target",
        knowledgeIds: [record.id],
      }),
    ).toHaveLength(1);
    teamMembers.delete("source");
    await expect(
      broker.retrieveForConsultation({
        originBotId: "source",
        targetBotId: "target",
        knowledgeIds: [record.id],
      }),
    ).rejects.toThrow("current team");
  });
  it.each(["revoke", "remove-target", "remove-origin", "archive"])(
    "rejects %s during an asynchronous document read",
    async (change) => {
      const { broker, teamId, teamMembers, read, archiveTeam } = harness();
      const record = await broker.promote({
        sourceBotId: "source",
        sessionId: "source-session",
        runId: "source-run",
        messageId: "message-1",
        teamId,
        title: "Team finding",
        consent: true,
      });
      broker.grant(record.id, "target", true);
      read.mockImplementationOnce(async () => {
        if (change === "revoke") broker.revoke(record.id, "target");
        if (change === "remove-target") teamMembers.delete("target");
        if (change === "remove-origin") teamMembers.delete("source");
        if (change === "archive") archiveTeam();
        return "Must not escape the revoked scope";
      });
      await expect(
        broker.retrieveForConsultation({
          originBotId: "source",
          targetBotId: "target",
          knowledgeIds: [record.id],
        }),
      ).rejects.toThrow();
    },
  );
  it("rejects ambiguous scopes, unknown members, unselected private text, and a promotion membership race", async () => {
    const { broker, teamId, teamMembers, add } = harness();
    const input = {
      sourceBotId: "source",
      sessionId: "source-session",
      runId: "source-run",
      messageId: "message-1",
      teamId,
      title: "Finding",
      consent: true as const,
    };
    await expect(
      broker.promote({ ...input, projectId: "project-1" }),
    ).rejects.toThrow("scoped");
    teamMembers.delete("source");
    await expect(broker.promote(input)).rejects.toThrow("current team");
    expect(add).not.toHaveBeenCalled();
    teamMembers.add("source");
    await expect(
      broker.promote({ ...input, messageId: "private-other-message" }),
    ).rejects.toThrow("Selected source");
    add.mockImplementationOnce(async () => {
      teamMembers.delete("source");
      return "00000000-0000-4000-8000-000000000002";
    });
    await expect(broker.promote(input)).rejects.toThrow("current team");
    expect(broker.ledger.list()).toEqual([]);
  });
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
    expect(read).toHaveBeenCalledOnce();
    read.mockClear();
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
    read.mockClear();
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
