import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import type { AccountPoolSnapshot } from "@doolittle/agent/runtime/native/account-pool";
import {
  type BotDefinition,
  isNativeNamedBotGrantRoute,
  NATIVE_NAMED_BOT_GRANT_PATH,
} from "@doolittle/contracts/bots";
import {
  NAMED_ACCOUNT_ID,
  namedProviderPool,
} from "./bot-process/provider-connections";
import type { BotProcessRegistry } from "./bot-process-registry";
import {
  type ProjectAccessScope,
  projectAccessScope,
} from "./bot-project-access";
import { isRecord } from "./ipc/input-validation";

const PREVIEW_TTL_MS = 90_000;
const PROJECT_ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
const OFFLINE_MODEL = { provider: "offline", model: "offline" };
const DESKTOP_PROVIDERS = ["openai", "anthropic", "codex"] as const;

type ProjectRef = { id: string; primaryPath?: string };
type NewProject = ProjectRef & { name: string; primaryPath: string };
type ScopedProject = Awaited<ReturnType<BotProcessRegistry["readLeadProject"]>>;
type Account = {
  provider: (typeof DESKTOP_PROVIDERS)[number];
  accountId: string;
  label: string;
  createdAt: number;
};
type Preview = {
  botId: string;
  botState: string;
  resource: "provider" | "project-grants";
  expiresAt: number;
  apply: () => Promise<void>;
};

export type NativeBotGrantOptions = {
  readAccounts: () => AccountPoolSnapshot;
  listProjects: () => ProjectRef[];
  createProject: (project: NewProject) => unknown;
};

function desktopProviderPool(provider: string) {
  return DESKTOP_PROVIDERS.some((id) => id === provider)
    ? namedProviderPool(provider)
    : undefined;
}

export function nativeNamedProviderAccount(bot: BotDefinition) {
  const pool = desktopProviderPool(bot.model.provider);
  const [reference] = bot.permissions.connectionIds;
  if (
    pool &&
    bot.permissions.connectionIds.length === 1 &&
    reference?.startsWith(`${pool}:`)
  ) {
    const accountId = reference.slice(pool.length + 1);
    if (NAMED_ACCOUNT_ID.test(accountId)) return { pool, accountId };
  }
  return null;
}

/** Workers continue to use the private profile and a single explicit model account. */
export function nativeNamedDefinition(
  registry: BotProcessRegistry,
  id: string,
) {
  try {
    const bot = registry.get(id);
    const validModel =
      nativeNamedProviderAccount(bot) ||
      (bot.model.provider === OFFLINE_MODEL.provider &&
        bot.model.model === OFFLINE_MODEL.model &&
        bot.permissions.connectionIds.length === 0);
    return !bot.isDefault &&
      !bot.archivedAt &&
      !bot.projectId &&
      validModel &&
      !bot.permissions.allowMutation &&
      !bot.permissions.allowDelegation &&
      bot.permissions.toolIds.length === 0 &&
      bot.permissions.workspacePaths.length === 1 &&
      bot.permissions.workspacePaths[0] === bot.workspacePath &&
      bot.workspacePath === registry.privateBotWorkspace(id)
      ? bot
      : null;
  } catch {
    return null;
  }
}

function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= max &&
    !/[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

function bodyOnly(body: Record<string, unknown>, fields: string[]) {
  if (Object.keys(body).some((key) => !fields.includes(key)))
    throw new GrantInputError("Invalid access request fields.");
}

class GrantInputError extends Error {}
class GrantConflict extends Error {}

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

/** Route mutations are delegated only after an authenticated desktop operator reviews a preview. */
export function createNativeBotGrants(
  registry: BotProcessRegistry,
  options: NativeBotGrantOptions,
) {
  const previews = new Map<string, Preview>();
  const requiredBot = (id: string) => {
    const bot = nativeNamedDefinition(registry, id);
    if (!bot) throw new GrantConflict("Named agent is unavailable.");
    return bot;
  };
  const stillStopped = (id: string) => {
    try {
      registry.assertNamedBotStopped(id);
    } catch {
      throw new GrantConflict("Stop this agent before changing its access.");
    }
  };
  const currentBot = (bot: BotDefinition) => {
    const current = requiredBot(bot.id);
    stillStopped(bot.id);
    if (JSON.stringify(current) !== JSON.stringify(bot))
      throw new GrantConflict("Agent settings changed. Review access again.");
    return current;
  };

  function accounts(): { inventory: string; accounts: Account[] } {
    const snapshot = options.readAccounts();
    const accounts: Account[] = [];
    for (const provider of DESKTOP_PROVIDERS) {
      const pool = desktopProviderPool(provider);
      if (!pool) continue;
      for (const row of snapshot.providers[pool].accounts) {
        if (
          !row.enabled ||
          !NAMED_ACCOUNT_ID.test(row.accountId) ||
          !safeText(row.label, 160) ||
          !Number.isFinite(row.createdAt)
        )
          continue;
        accounts.push({
          provider,
          accountId: row.accountId,
          label: row.label,
          createdAt: row.createdAt,
        });
      }
    }
    return { inventory: snapshot.inventory, accounts };
  }

  async function projectByFolder(
    folder: string,
  ): Promise<ScopedProject | null> {
    const matches = options.listProjects().filter(({ primaryPath }) => {
      if (!primaryPath || !isAbsolute(primaryPath)) return false;
      try {
        return realpathSync(primaryPath) === folder;
      } catch {
        return false;
      }
    });
    if (matches.length > 1)
      throw new GrantConflict(
        "More than one lead project uses this directory.",
      );
    return matches[0] ? registry.readLeadProject(matches[0].id) : null;
  }

  async function access(bot: BotDefinition, projectId: string) {
    try {
      const project = await registry.readLeadProject(projectId);
      const scope = projectAccessScope(bot, project);
      return registry.projectAccess.has(scope) ? { project, scope } : null;
    } catch {
      return null;
    }
  }

  function remember(
    bot: BotDefinition,
    resource: Preview["resource"],
    detail: string,
    apply: Preview["apply"],
  ) {
    const now = Date.now();
    for (const [id, preview] of previews)
      if (preview.expiresAt <= now) previews.delete(id);
    if (previews.size >= 128)
      throw new GrantConflict("Too many access previews. Try again shortly.");
    const previewId = randomUUID();
    previews.set(previewId, {
      botId: bot.id,
      botState: JSON.stringify(bot),
      resource,
      expiresAt: now + PREVIEW_TTL_MS,
      apply,
    });
    return Response.json({ previewId, detail });
  }

  function previewProvider(bot: BotDefinition, body: Record<string, unknown>) {
    bodyOnly(body, ["provider", "model", "accountId"]);
    const { provider, model, accountId } = body;
    if (!safeText(provider, 80) || !safeText(model, 160))
      throw new GrantInputError("Select a provider and enter its model ID.");
    const pool = desktopProviderPool(provider);
    if (
      pool
        ? typeof accountId !== "string" || !NAMED_ACCOUNT_ID.test(accountId)
        : provider !== "offline" ||
          model !== "offline" ||
          accountId !== undefined
    )
      throw new GrantInputError(
        "Select one connected account for this provider.",
      );
    const selected = pool
      ? accounts().accounts.find(
          (row) => row.provider === provider && row.accountId === accountId,
        )
      : undefined;
    if (pool && !selected)
      throw new GrantConflict(
        "The selected account is unavailable. Check Connections and try again.",
      );
    currentBot(bot);
    const connectionIds = selected ? [`${pool}:${selected.accountId}`] : [];
    const changedAccount =
      JSON.stringify(bot.permissions.connectionIds) !==
      JSON.stringify(connectionIds);
    const display = selected
      ? `${provider} / ${model}
Account: ${selected.label} (${selected.accountId})`
      : "Offline model";
    const consequence = changedAccount
      ? "\n\nThis clears existing project access approvals."
      : "";
    return remember(
      bot,
      "provider",
      `${bot.name}
${display}${consequence}

Start the agent when you’re ready.`,
      async () => {
        if (selected) {
          const now = accounts().accounts.find(
            (row) => row.provider === provider && row.accountId === accountId,
          );
          if (JSON.stringify(now) !== JSON.stringify(selected))
            throw new GrantConflict(
              "Account details changed. Review access again.",
            );
        }
        const current = currentBot(bot);
        await registry.update(bot.id, {
          model: { provider, model },
          permissions: { ...current.permissions, connectionIds },
        });
      },
    );
  }

  function sameScope(
    bot: BotDefinition,
    project: ScopedProject,
    expected: ProjectAccessScope,
  ) {
    const actual = projectAccessScope(currentBot(bot), project);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new GrantConflict(
        "The selected directory or permissions changed. Review access again.",
      );
    return actual;
  }

  async function previewProject(
    bot: BotDefinition,
    body: Record<string, unknown>,
  ) {
    bodyOnly(body, ["folder"]);
    if (!safeText(body.folder, 4_096) || !isAbsolute(body.folder))
      throw new GrantInputError("Choose an absolute project directory.");
    const folder = realpathSync(body.folder);
    const existing = await projectByFolder(folder);
    const name = basename(folder);
    if (!existing && !safeText(name, 200))
      throw new GrantInputError(
        "Choose a directory with a valid project name.",
      );
    const project = existing ?? {
      id: randomUUID(),
      name,
      workspacePath: folder,
    };
    const expected = projectAccessScope(currentBot(bot), project);
    return remember(
      bot,
      "project-grants",
      `${bot.name}\n${project.name}\n${folder}\n\nAllow read-only access in new project conversations. This agent’s model provider can receive content read from this folder.`,
      async () => {
        const registered = await projectByFolder(folder);
        if (JSON.stringify(registered) !== JSON.stringify(existing))
          throw new GrantConflict(
            "The lead project changed. Review access again.",
          );
        const scope = sameScope(bot, project, expected);
        if (!registered)
          options.createProject({
            id: project.id,
            name: project.name,
            primaryPath: folder,
          });
        registry.projectAccess.rememberConfirmed(scope);
      },
    );
  }

  async function previewRevocation(bot: BotDefinition, projectId: string) {
    const findGrant = () =>
      registry.projectAccess
        .list(bot.id)
        .find((entry) => entry.projectId === projectId);
    const grant = findGrant();
    if (!grant)
      throw new GrantConflict("This project approval has already changed.");
    const active = await access(bot, projectId);
    currentBot(bot);
    return remember(
      bot,
      "project-grants",
      `${bot.name}
${active?.project.name ?? basename(grant.workspacePath)}
${grant.workspacePath}

Revoke this agent’s access to the directory. Conversation history is retained.`,
      async () => {
        currentBot(bot);
        if (JSON.stringify(findGrant()) !== JSON.stringify(grant))
          throw new GrantConflict("This project approval has already changed.");
        registry.projectAccess.forgetProject(bot.id, projectId);
      },
    );
  }

  return async (request: Request, url: URL): Promise<Response | null> => {
    const match = NATIVE_NAMED_BOT_GRANT_PATH.exec(url.pathname);
    if (!match || !isNativeNamedBotGrantRoute(request.method, url.pathname))
      return null;
    if (url.search || url.hash) return fail("Invalid access route.", 400);
    const [, id, resource, action] = match;
    const bot = nativeNamedDefinition(registry, id);
    if (!bot) return fail("Named agent is unavailable.", 404);
    try {
      if (request.method === "GET") {
        if (resource === "provider") {
          const { inventory, accounts: available } = accounts();
          return Response.json({
            inventory,
            accounts: available.map(({ provider, accountId, label }) => ({
              provider,
              accountId,
              label,
            })),
          });
        }
        const projects = [];
        for (const grant of registry.projectAccess.list(bot.id)) {
          const active = await access(bot, grant.projectId);
          projects.push({
            id: grant.projectId,
            name: active?.project.name ?? basename(grant.workspacePath),
            workspacePath: grant.workspacePath,
            available: active !== null,
          });
        }
        return Response.json({ projects });
      }
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body))
        throw new GrantInputError("An access request is required.");
      if (resource === "project-chats") {
        bodyOnly(body, ["projectId"]);
        if (
          typeof body.projectId !== "string" ||
          !PROJECT_ID.test(body.projectId)
        )
          throw new GrantInputError("Select a project.");
        const worker = registry.readyBackendFor(id);
        if (!worker)
          throw new GrantConflict(
            "Start this agent before opening a project chat.",
          );
        const grant = await access(bot, body.projectId);
        if (!grant || registry.readyBackendFor(id) !== worker)
          throw new GrantConflict(
            "The project folder or worker is no longer approved.",
          );
        const sessionId = randomUUID();
        registry.bindConversationWorkspace(id, sessionId, grant.project);
        return Response.json({ sessionId }, { status: 201 });
      }
      if (action === "confirm") {
        bodyOnly(body, ["previewId"]);
        const previewId = body.previewId;
        if (typeof previewId !== "string")
          throw new GrantInputError("An access preview is required.");
        const preview = previews.get(previewId);
        if (!preview || preview.botId !== id || preview.resource !== resource)
          throw new GrantConflict("Review this access request again.");
        previews.delete(previewId);
        if (
          preview.expiresAt <= Date.now() ||
          preview.botState !== JSON.stringify(bot)
        )
          throw new GrantConflict(
            "The access preview expired or changed. Review it again.",
          );
        stillStopped(id);
        await preview.apply();
        return Response.json({ ok: true });
      }
      stillStopped(id);
      if (action === "revoke") {
        bodyOnly(body, ["projectId"]);
        if (
          typeof body.projectId !== "string" ||
          !PROJECT_ID.test(body.projectId)
        )
          throw new GrantInputError("Select a project.");
        return await previewRevocation(bot, body.projectId);
      }
      return resource === "provider"
        ? previewProvider(bot, body)
        : await previewProject(bot, body);
    } catch (error) {
      if (error instanceof GrantInputError) return fail(error.message, 400);
      if (error instanceof GrantConflict) return fail(error.message, 409);
      return fail(
        "The account or project access request could not be completed.",
        409,
      );
    }
  };
}
