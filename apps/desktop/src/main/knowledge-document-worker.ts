import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import { type BackendLaunchTarget, BackendManager } from "./backend";

const BROKER_ID = "knowledge-broker";
// Stable SDK identity for this private store across desktop restarts.
const BROKER_AGENT_ID = "ca1731b6-2807-0a48-b38e-2919c8398999";
const MAX_RESPONSE_BYTES = 250_000;

async function jsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES)
    throw new Error("Knowledge broker response is too large.");
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Knowledge broker response is invalid.");
  return value as Record<string, unknown>;
}

/** Not a catalog bot: a private SDK DocumentService process with no chat route. */
export class KnowledgeDocumentWorker {
  private readonly backend: BackendManager;
  private readonly token = randomBytes(32).toString("hex");
  private starting?: Promise<string>;

  constructor(
    target: BackendLaunchTarget,
    dataDir: string,
    private readonly runtimeFetch: typeof fetch = fetch,
  ) {
    const workerDir = resolve(dataDir, "bots", BROKER_ID);
    const workspacePath = resolve(workerDir, "workspace");
    mkdirSync(workspacePath, { recursive: true, mode: 0o700 });
    const profile: BotDefinition = {
      id: BROKER_ID,
      agentId: BROKER_AGENT_ID,
      name: "Knowledge Broker",
      persona: "Private SDK document storage. No conversational work.",
      model: { provider: "offline", model: "offline" },
      permissions: {
        connectionIds: [],
        workspacePaths: [workspacePath],
        toolIds: [],
        allowMutation: false,
        allowDelegation: false,
      },
      workspacePath,
      isDefault: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const source = process.env;
    const environment: NodeJS.ProcessEnv = {
      PATH: source.PATH,
      LANG: source.LANG,
      LC_ALL: source.LC_ALL,
      TMPDIR: source.TMPDIR,
      TEMP: source.TEMP,
      TMP: source.TMP,
      SYSTEMROOT: source.SYSTEMROOT,
      WINDIR: source.WINDIR,
      HOME: workerDir,
      USERPROFILE: workerDir,
      ELIZA_HOME: workerDir,
      CODEX_HOME: resolve(workerDir, "codex-home"),
      CLAUDE_CONFIG_DIR: resolve(workerDir, "claude-config"),
      DOOLITTLE_NAME: profile.name,
      DOOLITTLE_BOT_RUNTIME: "worker",
      DOOLITTLE_BOT_PROFILE: JSON.stringify(profile),
      DOOLITTLE_KNOWLEDGE_BROKER: "1",
      DOOLITTLE_KNOWLEDGE_BROKER_TOKEN: this.token,
      DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
      ...(target.environment?.ELECTRON_RUN_AS_NODE
        ? { ELECTRON_RUN_AS_NODE: target.environment.ELECTRON_RUN_AS_NODE }
        : {}),
    };
    this.backend = new BackendManager(
      target,
      workerDir,
      workspacePath,
      runtimeFetch,
      {
        isolatedEnvironment: environment,
        expectedBotId: profile.id,
        expectedAgentId: profile.agentId,
      },
    );
  }

  private async endpoint(): Promise<string> {
    if (this.backend.getState().phase === "ready") {
      const url = this.backend.getState().url;
      if (url) return url;
    }
    this.starting ??= this.backend
      .start()
      .then((state) => {
        if (state.phase !== "ready" || !state.url)
          throw new Error(
            state.detail ?? "Private knowledge broker is unavailable.",
          );
        return state.url;
      })
      .finally(() => {
        this.starting = undefined;
      });
    return this.starting;
  }

  async add(input: {
    clientDocumentId: string;
    content: string;
    title: string;
    projectId?: string;
    scope?: { kind: "project" | "team"; id: string };
  }): Promise<string> {
    const url = await this.endpoint();
    const response = await this.runtimeFetch(`${url}/knowledge/documents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 201)
      throw new Error(
        `SDK document promotion failed (HTTP ${response.status}).`,
      );
    const payload = await jsonResponse(response);
    if (
      typeof payload.documentId !== "string" ||
      !/^[0-9a-f-]{36}$/iu.test(payload.documentId)
    ) {
      throw new Error("SDK document receipt is invalid.");
    }
    return payload.documentId;
  }

  async read(documentId: string): Promise<string> {
    const url = await this.endpoint();
    const response = await this.runtimeFetch(
      `${url}/knowledge/documents/${encodeURIComponent(documentId)}`,
      {
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("Promoted SDK document is unavailable.");
    const payload = await jsonResponse(response);
    if (
      payload.documentId !== documentId ||
      typeof payload.content !== "string"
    ) {
      throw new Error("Promoted SDK document receipt is invalid.");
    }
    return payload.content;
  }

  async stop(): Promise<void> {
    await this.backend.stop();
  }
}
