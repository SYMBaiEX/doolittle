import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { NATIVE_USER_PERSONALITY_PREFERENCES_TABLE } from "@/services/user-profile/native-personality";
import type { UserProfileRecord } from "@/types";
import {
  extractDisplayNameUpdate,
  rememberNativeUserPersonalityPreferences,
} from "./chat-turn/native/profile-memory";

describe("profile memory native turn helpers", () => {
  it("extracts explicit display name updates from mixed requests", () => {
    expect(
      extractDisplayNameUpdate(
        "Update my name to SYMBiEX, tell me about yourself.",
      ),
    ).toBe("SYMBiEX");
    expect(extractDisplayNameUpdate("My name is Alex.")).toBe("Alex");
  });

  it("ignores unrelated identity questions", () => {
    expect(extractDisplayNameUpdate("What is your name?")).toBeUndefined();
  });

  it("mirrors profile interaction preferences into native user personality memory", async () => {
    const memories: Array<{
      id: string;
      content: { text: string };
      metadata?: Record<string, unknown>;
    }> = [
      {
        id: "old-name",
        content: { text: "Address the user as Alex when natural." },
        metadata: {
          category: "identity/display-name",
          source: "doolittle-profile-memory",
        },
      },
    ];
    const writes: string[] = [];
    const deletes: string[] = [];
    const context = {
      runtime: {
        agentId: "agent-1",
        getMemories: async (params: { tableName: string }) => {
          expect(params.tableName).toBe(
            NATIVE_USER_PERSONALITY_PREFERENCES_TABLE,
          );
          return memories;
        },
        createMemory: async (
          memory: { content: { text?: string } },
          tableName: string,
        ) => {
          expect(tableName).toBe(NATIVE_USER_PERSONALITY_PREFERENCES_TABLE);
          writes.push(memory.content.text ?? "");
          memories.push({
            id: `new-${writes.length}`,
            content: { text: memory.content.text ?? "" },
            metadata: {},
          });
          return `new-${writes.length}`;
        },
        deleteMemory: async (id: string) => {
          deletes.push(id);
        },
        logger: {
          warn: () => undefined,
        },
      },
    } as unknown as AgentExecutionContext;
    const profile = {
      displayName: "SYMBiEX",
      preferences: ["Prefers concise status updates."],
      toolPreferences: ["Bun"],
      workStyle: ["show checkpoints"],
    } as UserProfileRecord;

    const written = await rememberNativeUserPersonalityPreferences({
      context,
      entityId: "user-1",
      profile,
      sessionId: "session-1",
      message: "Update my name to SYMBiEX.",
    });

    expect(deletes).toEqual(["old-name"]);
    expect(written).toBe(4);
    expect(writes).toContain("Address the user as SYMBiEX when natural.");
    expect(writes).toContain("Prefers concise status updates.");
    expect(writes).toContain("Tool preference: Bun");
    expect(writes).toContain("Interaction style: show checkpoints");
  });
});
