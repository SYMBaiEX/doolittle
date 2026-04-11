import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoredMessage } from "@/types";
import {
  analyzeConversationForSkill,
  buildConversationGeneratedSkillRecord,
  writeConversationSkillDocument,
} from "./conversation";

describe("skill synthesis conversation helpers", () => {
  it("detects reusable workflow conversations", () => {
    const messages: StoredMessage[] = [
      {
        id: "1",
        role: "user",
        text: "Build a repeatable docker deploy workflow",
        createdAt: "2026-03-20T00:00:00.000Z",
      } as never,
      {
        id: "2",
        role: "assistant",
        text: "1. Build the image locally.\n2. Push to the registry.\n3. Restart the docker compose stack.\nImportant: verify the health endpoint after deploy.",
        createdAt: "2026-03-20T00:00:01.000Z",
      } as never,
      {
        id: "3",
        role: "user",
        text: "That solved it, let's document the workflow.",
        createdAt: "2026-03-20T00:00:02.000Z",
      } as never,
      {
        id: "4",
        role: "assistant",
        text: "We learned the reliable pattern: build, push, restart, then verify. Repeat this workflow for future releases.",
        createdAt: "2026-03-20T00:00:03.000Z",
      } as never,
    ];

    const analysis = analyzeConversationForSkill(messages);

    expect(analysis.shouldSynthesize).toBe(true);
    expect(analysis.candidate?.slug).toContain("docker-deploy-workflow");
    expect(analysis.candidate?.category).toBe("software-development");
    expect(analysis.candidate?.steps.length).toBeGreaterThan(0);
  });

  it("writes conversation-derived skill documents and index records", () => {
    const generatedDir = mkdtempSync(
      join(tmpdir(), "doolittle-skill-conversation-"),
    );
    const candidate = {
      slug: "deploy-workflow",
      title: "Deploy Workflow",
      rationale: "Reusable deployment sequence detected.",
      category: "operations",
      steps: ["Build the image", "Push the image", "Restart the service"],
      signals: ["workflow", "important", "repeat"],
    };
    const messages: StoredMessage[] = [
      { id: "1", role: "user", text: "deploy it", createdAt: "" } as never,
      {
        id: "2",
        role: "assistant",
        text: "Build, push, and restart the stack.",
        createdAt: "",
      } as never,
    ];

    try {
      const path = writeConversationSkillDocument({
        generatedDir,
        candidate,
        messages,
        sessionId: "session-1",
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:01.000Z",
      });
      const record = buildConversationGeneratedSkillRecord({
        candidate,
        sessionId: "session-1",
        path,
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:01.000Z",
      });
      const content = readFileSync(path, "utf8");

      expect(content).toContain("## Key Steps");
      expect(content).toContain("## Conversation Context (excerpt)");
      expect(record.taskId).toBe("conversation:session-1");
      expect(record.signalCount).toBe(3);
    } finally {
      rmSync(generatedDir, { recursive: true, force: true });
    }
  });
});
