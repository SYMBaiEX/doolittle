import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { BotDefinition, BotPermissions } from "@doolittle/contracts/bots";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

const BOT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const PROJECT_ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
const MAX_BYTES = 2_000_000;
const MAX_GRANTS = 4_096;

export interface ProjectAccessScope {
  botId: string;
  projectId: string;
  workspacePath: string;
  directoryIdentity: string;
  permissionsFingerprint: string;
}

interface ProjectAccessGrant extends ProjectAccessScope {
  source: "native-confirmation";
  confirmedAt: string;
}

export function permissionsFingerprint(permissions: BotPermissions): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        connectionIds: [...new Set(permissions.connectionIds)].sort(),
        workspacePaths: [...new Set(permissions.workspacePaths)].sort(),
        toolIds: [...new Set(permissions.toolIds)].sort(),
        allowMutation: permissions.allowMutation,
        allowDelegation: permissions.allowDelegation,
      }),
    )
    .digest("hex");
}

/** Main-process evidence; renderer paths and historical conversation rows are never authority. */
export function projectAccessScope(
  bot: BotDefinition,
  project: { id: string; workspacePath: string },
): ProjectAccessScope {
  const root = project.workspacePath;
  if (realpathSync(root) !== root)
    throw new Error("Selected project root changed.");
  const directory = statSync(root, { bigint: true });
  if (!directory.isDirectory())
    throw new Error("Selected project root is not a directory.");
  const scope = {
    botId: bot.id,
    projectId: project.id,
    workspacePath: root,
    directoryIdentity:
      String(directory.dev) +
      ":" +
      String(directory.ino) +
      ":" +
      String(directory.birthtimeNs),
    permissionsFingerprint: permissionsFingerprint(bot.permissions),
  };
  if (!validScope(scope)) throw new Error("Project approval scope is invalid.");
  return scope;
}

function validScope(value: unknown): value is ProjectAccessScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scope = value as Partial<ProjectAccessScope>;
  return (
    typeof scope.botId === "string" &&
    BOT_ID.test(scope.botId) &&
    typeof scope.projectId === "string" &&
    PROJECT_ID.test(scope.projectId) &&
    typeof scope.workspacePath === "string" &&
    scope.workspacePath.length <= 4_096 &&
    isAbsolute(scope.workspacePath) &&
    resolve(scope.workspacePath) === scope.workspacePath &&
    !Array.from(scope.workspacePath).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    typeof scope.directoryIdentity === "string" &&
    /^[0-9]{1,40}:[0-9]{1,40}:[0-9]{1,40}$/u.test(scope.directoryIdentity) &&
    typeof scope.permissionsFingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(scope.permissionsFingerprint)
  );
}

function validGrant(value: unknown): value is ProjectAccessGrant {
  if (!validScope(value)) return false;
  const grant = value as Partial<ProjectAccessGrant>;
  return (
    grant.source === "native-confirmation" &&
    typeof grant.confirmedAt === "string" &&
    !Number.isNaN(Date.parse(grant.confirmedAt)) &&
    Object.keys(grant).every((key) =>
      [
        "botId",
        "projectId",
        "workspacePath",
        "directoryIdentity",
        "permissionsFingerprint",
        "source",
        "confirmedAt",
      ].includes(key),
    )
  );
}

/** A reusable approval creates future chat grants; it never changes an existing chat's scope. */
export class BotProjectAccessStore {
  private readonly path: string;
  private grants: ProjectAccessGrant[] = [];
  private failed = false;

  constructor(dataDir: string) {
    this.path = resolve(dataDir, "bots", "project-access.json");
    if (!existsSync(this.path)) return;
    try {
      this.assertOwnedStore();
      const file = lstatSync(this.path);
      if (!file.isFile() || file.isSymbolicLink() || file.size > MAX_BYTES)
        return;
      const stored = JSON.parse(readFileSync(this.path, "utf8"));
      if (
        stored?.version !== 1 ||
        !Array.isArray(stored.grants) ||
        stored.grants.length > MAX_GRANTS ||
        !stored.grants.every(validGrant)
      )
        return;
      this.grants = stored.grants;
    } catch {
      // Corrupt approval metadata cannot grant access. The next native approval
      // rebuilds this optional reuse store; immutable chat history is untouched.
    }
  }

  has(scope: ProjectAccessScope): boolean {
    return (
      !this.failed &&
      validScope(scope) &&
      this.grants.some(
        (grant) =>
          grant.botId === scope.botId &&
          grant.projectId === scope.projectId &&
          grant.workspacePath === scope.workspacePath &&
          grant.directoryIdentity === scope.directoryIdentity &&
          grant.permissionsFingerprint === scope.permissionsFingerprint,
      )
    );
  }

  rememberConfirmed(scope: ProjectAccessScope): void {
    if (!validScope(scope))
      throw new Error("Project approval scope is invalid.");
    this.save([
      ...this.grants.filter(
        (grant) =>
          grant.botId !== scope.botId || grant.projectId !== scope.projectId,
      ),
      {
        ...scope,
        source: "native-confirmation",
        confirmedAt: new Date().toISOString(),
      },
    ]);
  }

  forgetBot(botId: string): void {
    if (!BOT_ID.test(botId)) throw new Error("Bot ID is invalid.");
    if (this.grants.some((grant) => grant.botId === botId))
      this.save(this.grants.filter((grant) => grant.botId !== botId));
  }

  private save(grants: ProjectAccessGrant[]): void {
    const value = { version: 1, grants };
    if (
      grants.length > MAX_GRANTS ||
      Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES
    )
      throw new Error("Saved project approvals are full.");
    try {
      this.assertOwnedStore();
      mkdirSync(resolve(this.path, ".."), { recursive: true, mode: 0o700 });
      // One atomic authoritative file: a stale backup must not resurrect forgotten grants.
      writeJsonAtomicSync(this.path, value, { trailingNewline: true });
      chmodSync(this.path, 0o600);
      this.grants = grants;
      this.failed = false;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  private assertOwnedStore(): void {
    const parent = resolve(this.path, "..");
    if (existsSync(parent)) {
      const directory = lstatSync(parent);
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new Error("Project approval storage is not a private directory.");
    }
    if (existsSync(this.path)) {
      const file = lstatSync(this.path);
      if (!file.isFile() || file.isSymbolicLink())
        throw new Error("Project approval storage is not a private file.");
    }
  }
}
