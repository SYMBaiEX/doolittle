import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BotAcpSessionLedger } from "../../apps/desktop/src/main/bot-acp-session-ledger";
import { BotAutomationLedger } from "../../apps/desktop/src/main/bot-automation-ledger";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";
import { BotConsultationLedger } from "../../apps/desktop/src/main/bot-consultation-ledger";
import { BotConversationLedger } from "../../apps/desktop/src/main/bot-conversation-ledger";
import { BotKnowledgeLedger } from "../../apps/desktop/src/main/bot-knowledge-ledger";
import { BotTeamCatalog } from "../../apps/desktop/src/main/bot-team-catalog";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const ledgers = [
  {
    name: "conversation-owners",
    limit: 4_000_000,
    empty: { version: 1, conversations: [] },
    open: (dir: string) => new BotConversationLedger(dir),
  },
  {
    name: "acp-session-owners",
    limit: 2_000_000,
    empty: { version: 1, revision: 0, sessions: [] },
    open: (dir: string) => new BotAcpSessionLedger(dir),
  },
  {
    name: "automation-dispatches",
    limit: 8_000_000,
    empty: { version: 1, revision: 0, approvals: [], fires: [] },
    open: (dir: string) => new BotAutomationLedger(dir),
  },
  {
    name: "consultations",
    limit: 8_000_000,
    empty: { version: 1, revision: 0, records: [] },
    open: (dir: string) => new BotConsultationLedger(dir),
  },
  {
    name: "knowledge",
    limit: 4_000_000,
    empty: { version: 2, revision: 0, records: [], grants: [] },
    open: (dir: string) => new BotKnowledgeLedger(dir),
  },
  {
    name: "teams",
    limit: 1_000_000,
    empty: { version: 1, revision: 0, teams: [] },
    open: (dir: string) =>
      new BotTeamCatalog(dir, () => {
        throw new Error("unexpected bot lookup");
      }),
  },
  {
    name: "catalog",
    limit: 2_000_000,
    empty: { version: 1, bots: [] },
    open: (dir: string) =>
      new BotCatalog(
        dir,
        {} as ConstructorParameters<typeof BotCatalog>[1],
        dir,
      ),
  },
];
function fixture(name: string) {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-state-read-"));
  directories.push(dir);
  mkdirSync(resolve(dir, "bots"));
  return {
    dir,
    primary: resolve(dir, "bots", `${name}.json`),
    backup: resolve(dir, "bots", `${name}.backup.json`),
  };
}
for (const ledger of ledgers)
  describe(ledger.name, () => {
    it("reads a valid regular file", () => {
      const f = fixture(ledger.name);
      writeFileSync(f.primary, JSON.stringify(ledger.empty));
      expect(() => ledger.open(f.dir)).not.toThrow();
    });
    it("refuses a linked primary instead of importing another file as authority", () => {
      const f = fixture(ledger.name);
      const other = resolve(f.dir, "other.json");
      writeFileSync(other, JSON.stringify(ledger.empty));
      symlinkSync(other, f.primary);
      expect(() => ledger.open(f.dir)).toThrow();
      expect(JSON.parse(readFileSync(other, "utf8"))).toEqual(ledger.empty);
    });
    it("rejects an oversized regular file", () => {
      const f = fixture(ledger.name);
      writeFileSync(f.primary, "{}");
      truncateSync(f.primary, ledger.limit + 1);
      expect(() => ledger.open(f.dir)).toThrow();
    });
    if (ledger.name !== "catalog")
      it("recovers from a rejected primary using its valid regular backup", () => {
        const f = fixture(ledger.name);
        const other = resolve(f.dir, "other.json");
        writeFileSync(other, JSON.stringify(ledger.empty));
        symlinkSync(other, f.primary);
        writeFileSync(f.backup, JSON.stringify(ledger.empty));
        expect(() => ledger.open(f.dir)).not.toThrow();
      });
  });
