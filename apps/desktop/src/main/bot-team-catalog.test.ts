import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import { afterEach, describe, expect, it } from "vitest";
import { BotTeamCatalog } from "./bot-team-catalog";

const SOURCE = "00000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-000000000002";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-team-catalog-"));
  dirs.push(dir);
  const bots = new Map([
    [SOURCE, { id: SOURCE }],
    [TARGET, { id: TARGET }],
  ]) as Map<string, Partial<BotDefinition>>;
  const get = (id: string) => {
    const bot = bots.get(id);
    if (!bot || bot.archivedAt) throw new Error("Bot not found or archived.");
    return bot as BotDefinition;
  };
  return { dir, bots, get, catalog: new BotTeamCatalog(dir, get) };
}
describe("explicit persistent team catalog", () => {
  it("persists stable IDs and explicit members privately, without adopting other bots", () => {
    const { dir, get, catalog } = fixture();
    const team = catalog.create({
      name: "Research",
      memberBotIds: [SOURCE],
      expectedRevision: 0,
    });
    expect(new BotTeamCatalog(dir, get).get(team.id)).toEqual(team);
    expect(catalog.list().revision).toBe(1);
    expect(() => catalog.assertMember(team.id, TARGET)).toThrow(
      "current team member",
    );
    const snapshot = catalog.list();
    snapshot.teams[0].memberBotIds.push(TARGET);
    expect(catalog.get(team.id).memberBotIds).toEqual([SOURCE]);
    for (const file of ["teams.json", "teams.backup.json"])
      expect(statSync(resolve(dir, "bots", file)).mode & 0o777).toBe(0o600);
    const updated = catalog.update(team.id, {
      memberBotIds: [SOURCE, TARGET],
      expectedRevision: 1,
    });
    expect(updated.id).toBe(team.id);
    catalog.assertMember(team.id, TARGET);
    catalog.archive(team.id, 2);
    expect(() =>
      new BotTeamCatalog(dir, get).assertMember(team.id, SOURCE),
    ).toThrow("archived");
    expect(catalog.list().teams).toHaveLength(1);
  });
  it("rejects aliases, duplicates, unknown or archived members and stale revisions", () => {
    const { bots, catalog } = fixture();
    for (const ids of [
      ["default"],
      [SOURCE, SOURCE],
      ["00000000-0000-4000-8000-000000000099"],
    ])
      expect(() =>
        catalog.create({
          name: "Team",
          memberBotIds: ids,
          expectedRevision: 0,
        }),
      ).toThrow();
    bots.set(TARGET, { id: TARGET, archivedAt: new Date().toISOString() });
    expect(() =>
      catalog.create({
        name: "Team",
        memberBotIds: [TARGET],
        expectedRevision: 0,
      }),
    ).toThrow("archived");
    catalog.create({
      name: "Team",
      memberBotIds: [SOURCE],
      expectedRevision: 0,
    });
    expect(() =>
      catalog.create({
        name: "Retry",
        memberBotIds: [SOURCE],
        expectedRevision: 0,
      }),
    ).toThrow("revision conflict");
    expect(catalog.list().teams).toHaveLength(1);
  });
  it("recovers a damaged copy, rejects corrupt or disagreeing copies, and restores the saved catalog", () => {
    const { dir, get, catalog } = fixture();
    const team = catalog.create({
      name: "Team",
      memberBotIds: [SOURCE],
      expectedRevision: 0,
    });
    const primary = resolve(dir, "bots", "teams.json");
    const backup = resolve(dir, "bots", "teams.backup.json");
    const saved = readFileSync(primary, "utf8");
    writeFileSync(primary, "broken");
    expect(new BotTeamCatalog(dir, get).get(team.id)).toEqual(team);
    writeFileSync(backup, "broken");
    expect(() => new BotTeamCatalog(dir, get)).toThrow("Both team");
    writeFileSync(primary, saved);
    writeFileSync(backup, saved);
    const other = JSON.parse(saved);
    other.teams[0].name = "Different";
    writeFileSync(backup, JSON.stringify(other));
    expect(() => new BotTeamCatalog(dir, get)).toThrow("disagree");
    writeFileSync(backup, saved);
    expect(new BotTeamCatalog(dir, get).get(team.id)).toEqual(team);
  });
});
