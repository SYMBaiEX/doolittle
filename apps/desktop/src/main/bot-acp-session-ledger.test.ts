import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BotAcpSessionLedger } from "./bot-acp-session-ledger";

describe("BotAcpSessionLedger", () => {
  it("keeps ACP protocol IDs separate from chat IDs and immutable across restart", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-acp-owner-"));
    try {
      const input = {
        sessionId: "acp:one",
        botId: "bot-one",
        originConversationId: "conversation-one",
        workspacePath: directory,
      };
      const ledger = new BotAcpSessionLedger(directory);
      ledger.bind(input);
      expect(ledger.assert("bot-one", "acp:one")).toMatchObject(input);
      expect(() => ledger.assert("bot-two", "acp:one")).toThrow(
        /another bot/iu,
      );
      expect(() => ledger.assert("bot-one", "conversation-one")).toThrow(
        /unavailable/iu,
      );
      expect(() => ledger.bind({ ...input, botId: "bot-two" })).toThrow(
        /another bot/iu,
      );
      const restarted = new BotAcpSessionLedger(directory);
      expect(restarted.assert("bot-one", "acp:one")).toMatchObject(input);
      const path = resolve(directory, "bots", "acp-session-owners.json");
      expect(readFileSync(path, "utf8")).toContain("conversation-one");
      writeFileSync(path, "invalid-json");
      expect(
        new BotAcpSessionLedger(directory).assert("bot-one", "acp:one"),
      ).toMatchObject(input);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
