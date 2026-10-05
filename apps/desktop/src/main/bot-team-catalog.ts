import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  BotDefinition,
  BotTeam,
  BotTeamCatalogResponse,
  CreateBotTeamInput,
  UpdateBotTeamInput,
} from "@doolittle/contracts/bots";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_BYTES = 1_000_000;
function date(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function parse(path: string): BotTeamCatalogResponse | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw) > MAX_BYTES)
    throw new Error("Team catalog is too large.");
  const data = JSON.parse(raw) as BotTeamCatalogResponse;
  if (
    data?.version !== 1 ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    !Array.isArray(data.teams) ||
    data.teams.length > 1_000 ||
    data.teams.some(
      (team) =>
        !team ||
        typeof team.id !== "string" ||
        !UUID.test(team.id) ||
        typeof team.name !== "string" ||
        !team.name.trim() ||
        team.name.length > 100 ||
        !Array.isArray(team.memberBotIds) ||
        team.memberBotIds.length > 100 ||
        team.memberBotIds.some(
          (id) => typeof id !== "string" || !UUID.test(id),
        ) ||
        new Set(team.memberBotIds).size !== team.memberBotIds.length ||
        !date(team.createdAt) ||
        !date(team.updatedAt) ||
        (team.archivedAt !== undefined && !date(team.archivedAt)),
    ) ||
    new Set(data.teams.map((team) => team.id)).size !== data.teams.length
  )
    throw new Error("Team catalog is invalid.");
  return data;
}

/** Private metadata only. No implicit migration of bot or project membership. */
export class BotTeamCatalog {
  private readonly path: string;
  private readonly backupPath: string;
  private stored: BotTeamCatalogResponse;
  private failed = false;

  constructor(
    dataDir: string,
    private readonly getBot: (id: string) => BotDefinition,
  ) {
    this.path = resolve(dataDir, "bots", "teams.json");
    this.backupPath = resolve(dataDir, "bots", "teams.backup.json");
    let primary: BotTeamCatalogResponse | null = null;
    let backup: BotTeamCatalogResponse | null = null;
    let failure: unknown;
    try {
      primary = parse(this.path);
    } catch (error) {
      failure = error;
    }
    try {
      backup = parse(this.backupPath);
    } catch (error) {
      failure ??= error;
    }
    if (failure && !primary && !backup)
      throw new Error("Both team catalog copies are unavailable.", {
        cause: failure,
      });
    if (
      primary &&
      backup &&
      primary.revision === backup.revision &&
      JSON.stringify(primary) !== JSON.stringify(backup)
    )
      throw new Error("Team catalog copies disagree.");
    this.stored =
      primary && (!backup || primary.revision >= backup.revision)
        ? primary
        : (backup ?? { version: 1, revision: 0, teams: [] });
  }

  list(): BotTeamCatalogResponse {
    if (this.failed) throw new Error("Team catalog requires recovery.");
    return structuredClone(this.stored);
  }
  get(id: string): BotTeam {
    if (this.failed) throw new Error("Team catalog requires recovery.");
    const team = this.stored.teams.find(
      (row) => row.id === id && !row.archivedAt,
    );
    if (!team) throw new Error("Team not found or archived.");
    return structuredClone(team);
  }
  assertMember(teamId: string, botId: string): void {
    const bot = this.getBot(botId);
    if (
      bot.id !== botId ||
      bot.archivedAt ||
      !this.get(teamId).memberBotIds.includes(bot.id)
    )
      throw new Error("Bot is not a current team member.");
  }
  private members(ids: unknown): string[] {
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Explicit canonical bot UUID membership is required.");
    for (const id of ids) {
      const bot = this.getBot(id);
      if (bot.id !== id || bot.archivedAt)
        throw new Error("Team member is unknown or archived.");
    }
    return [...ids];
  }
  private name(value: unknown): string {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 100 ||
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      throw new Error("Team name is invalid.");
    return value.trim();
  }
  assertRevision(revision: unknown): void {
    if (this.failed) throw new Error("Team catalog requires recovery.");
    if (!Number.isSafeInteger(revision) || revision !== this.stored.revision)
      throw new Error(
        "Team catalog revision conflict. Reload teams before making changes.",
      );
  }
  private save(teams: BotTeam[]): void {
    const next: BotTeamCatalogResponse = {
      version: 1,
      revision: this.stored.revision + 1,
      teams,
    };
    if (Buffer.byteLength(JSON.stringify(next)) > MAX_BYTES)
      throw new Error("Team catalog is full.");
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      writeJsonAtomicSync(this.path, next, { trailingNewline: true });
      chmodSync(this.path, 0o600);
      writeJsonAtomicSync(this.backupPath, next, { trailingNewline: true });
      chmodSync(this.backupPath, 0o600);
      this.stored = next;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }
  create(input: CreateBotTeamInput): BotTeam {
    this.assertRevision(input.expectedRevision);
    const name = this.name(input.name);
    const memberBotIds = this.members(input.memberBotIds);
    if (this.stored.teams.length >= 1_000)
      throw new Error("Team catalog is full.");
    const now = new Date().toISOString();
    const team: BotTeam = {
      id: randomUUID(),
      name,
      memberBotIds,
      createdAt: now,
      updatedAt: now,
    };
    this.save([...this.stored.teams, team]);
    return structuredClone(team);
  }
  update(id: string, input: UpdateBotTeamInput): BotTeam {
    this.assertRevision(input.expectedRevision);
    const previous = this.get(id);
    const team = {
      ...previous,
      name: input.name === undefined ? previous.name : this.name(input.name),
      memberBotIds: this.members(
        input.memberBotIds === undefined
          ? previous.memberBotIds
          : input.memberBotIds,
      ),
      updatedAt: new Date().toISOString(),
    };
    this.save(this.stored.teams.map((row) => (row.id === id ? team : row)));
    return structuredClone(team);
  }
  archive(id: string, expectedRevision: number): BotTeam {
    this.assertRevision(expectedRevision);
    const previous = this.get(id);
    const now = new Date().toISOString();
    const team = { ...previous, archivedAt: now, updatedAt: now };
    this.save(this.stored.teams.map((row) => (row.id === id ? team : row)));
    return structuredClone(team);
  }
}
