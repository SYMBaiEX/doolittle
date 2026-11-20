import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";
import { BotConversationLedger } from "../../apps/desktop/src/main/bot-conversation-ledger";
import { composeSessionServiceState } from "../../packages/agent/src/services/session/service/composition";
import { legacyProfileId } from "../../packages/agent/src/services/session/service/legacy-profile";
import { createSessionDatabase } from "../../packages/agent/src/services/session/service/support";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const root = fileURLToPath(new URL("../../", import.meta.url));

it.runIf(process.env.DOOLITTLE_RUN_RUNTIME_E2E === "1")(
  "runs the scoped ElizaOS native API and shuts down when the parent closes stdin",
  async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "doolittle-sidecar-"));
    const profile = join(sandbox, "profile");
    const workspace = join(sandbox, "workspace");
    await mkdir(profile, { mode: 0o700 });
    await mkdir(workspace);
    const environment = isolatedRuntimeEnvironment(profile);
    const legacyHome = join(await realpath(sandbox), "legacy-home");
    const legacyConfig = join(legacyHome, "config");
    const legacyRoot = join(
      process.platform === "darwin"
        ? join(legacyHome, "Library", "Application Support")
        : legacyConfig,
      "Doolittle",
    );
    const legacyData = join(legacyRoot, "runtime");
    const canonicalWorkspace = await realpath(workspace);
    await mkdir(join(legacyData, "bots"), { recursive: true, mode: 0o700 });
    await writeFile(
      join(legacyRoot, "workspace-state.json"),
      JSON.stringify({ currentPath: canonicalWorkspace }),
    );
    const legacyAgentId = randomUUID();
    new BotCatalog(
      legacyData,
      {
        getState: () => ({
          phase: "ready",
          agentId: legacyAgentId,
          message: "",
        }),
        getWorkspaceDirectory: () => canonicalWorkspace,
      },
      canonicalWorkspace,
    ).defaultBot();
    const legacyRoom = randomUUID();
    new BotConversationLedger(legacyData).bind(
      legacyAgentId,
      legacyRoom,
      undefined,
      canonicalWorkspace,
    );
    const oldDatabase = createSessionDatabase(legacyData);
    try {
      composeSessionServiceState(oldDatabase).writes.storeMessage({
        id: randomUUID(),
        sessionId: legacyRoom,
        roomId: legacyRoom,
        entityId: "local-user",
        role: "user",
        text: "Legacy conversation witness",
        createdAt: new Date().toISOString(),
      });
    } finally {
      oldDatabase.close();
    }
    await writeFile(join(workspace, "native-note.txt"), "workspace witness");
    await writeFile(join(workspace, "[ab].txt"), "literal index fixture\n");
    await writeFile(join(workspace, "a.txt"), "untouched index fixture\n");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", workspace, ...args], {
        env: isolatedRuntimeEnvironment(profile),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init", "-q");
    git("config", "user.name", "Native Fixture");
    git("config", "user.email", "native-fixture@example.invalid");
    await writeFile(
      join(workspace, ".git", "info", "exclude"),
      "/.env\n/dist/\n/alias.txt\n",
    );
    git("add", "--", "native-note.txt", "[ab].txt", "a.txt");
    git("commit", "-qm", "Initialize native fixture");
    await writeFile(join(workspace, "[ab].txt"), "literal changed\n");
    await writeFile(join(workspace, "a.txt"), "wildcard changed\n");
    await writeFile(join(sandbox, "outside.txt"), "do not change");
    await writeFile(join(workspace, ".env"), "fixture-only=value");
    await mkdir(join(workspace, "dist"));
    await writeFile(join(workspace, "dist", "generated.txt"), "generated");
    if (process.platform !== "win32")
      await symlink(join(sandbox, "outside.txt"), join(workspace, "alias.txt"));
    await writeFile(
      join(profile, "settings.json"),
      JSON.stringify({
        model: {
          provider: "offline",
          model: "offline",
          baseUrl: "",
          temperature: 0,
          maxTokens: 512,
          excludedFixtureField: "fixture hidden by native settings projection",
        },
      }),
    );
    const token = randomBytes(32).toString("hex");
    const child = spawn(
      process.execPath,
      [join(root, "apps/cli/dist/index.js"), "native-api"],
      {
        cwd: root,
        env: {
          ...environment,
          HOME: legacyHome,
          USERPROFILE: legacyHome,
          APPDATA: legacyConfig,
          XDG_CONFIG_HOME: legacyConfig,
          DOOLITTLE_REPO_ROOT: sandbox,
          DOOLITTLE_WORKSPACE_DIR: workspace,
          DOOLITTLE_NATIVE_WORKSPACE_SAVE: "1",
          DOOLITTLE_NATIVE_CONTROL_PLANE: "1",
          DOOLITTLE_NATIVE_MIGRATE_LEGACY: "1",
          ELIZA_API_TOKEN: token,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const exit = new Promise<number | null>((resolve) => {
      child.once("close", resolve);
    });
    const output = createInterface({ input: child.stdout });
    let endpoint: string | undefined;
    let migration: unknown;
    output.on("line", (line) => {
      if (!line.startsWith("DOOLITTLE_NATIVE_READY ")) return;
      const ready = JSON.parse(
        line.slice("DOOLITTLE_NATIVE_READY ".length),
      ) as {
        url: string;
        migration?: unknown;
      };
      if (/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(ready.url))
        endpoint = ready.url;
      migration = ready.migration;
    });
    let runtimeErrors = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      runtimeErrors = (runtimeErrors + chunk).slice(-4096);
    });
    try {
      await vi.waitFor(
        () => {
          expect(child.exitCode).toBeNull();
          expect(endpoint).toBeDefined();
        },
        { timeout: 30_000, interval: 100 },
      );
      const request = async (path: string, init?: RequestInit) => {
        try {
          return await fetch(`${endpoint}${path}`, {
            ...init,
            signal: AbortSignal.timeout(20_000),
            headers: { Authorization: `Bearer ${token}`, ...init?.headers },
          });
        } catch (cause) {
          throw new Error(`Native sidecar request failed: ${path}`, { cause });
        }
      };
      const post = (path: string, body: Record<string, unknown>) =>
        request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

      expect((await fetch(`${endpoint}/health`)).status).toBe(401);
      expect(
        (
          await request("/health", {
            headers: { Origin: "https://example.com" },
          })
        ).status,
      ).toBe(403);
      expect((await request("/health")).status).toBe(200);
      expect(migration).toEqual({
        importedConversations: 1,
        skippedConversations: 0,
        settingsImported: false,
        deferred: false,
      });
      const migratedRoom = legacyProfileId(
        join(legacyData, "state.db"),
        legacyRoom,
      );
      const history = await request(
        `/sessions/messages?sessionId=${migratedRoom}`,
      );
      expect(history.status).toBe(200);
      expect((await history.json()).messages).toMatchObject([
        { text: "Legacy conversation witness" },
      ]);
      expect((await post("/repo/mutate", {})).status).toBe(400);
      expect(
        (await post("/secrets/get", { key: "OPENAI_API_KEY" })).status,
      ).toBe(404);
      expect((await request("/settings")).status).toBe(200);
      expect(await (await request("/settings")).text()).not.toContain(
        "excludedFixtureField",
      );
      expect(
        (
          await post("/settings", {
            path: "mcp.servers.operator.env.key",
            value: "hidden",
          })
        ).status,
      ).toBe(400);
      const savedSettings = await post("/settings", {
        changes: [
          { path: "model.maxTokens", value: 640 },
          { path: "agent.maxIterations", value: 25 },
        ],
      });
      expect(savedSettings.status).toBe(200);
      expect(await savedSettings.json()).toMatchObject({
        settings: { model: { maxTokens: 640 }, agent: { maxIterations: 25 } },
      });
      expect(
        JSON.parse(await readFile(join(profile, "settings.json"), "utf8")),
      ).toMatchObject({ model: { maxTokens: 640 } });
      expect(
        (await post("/execution/approvals/unknown-local-approval/deny", {}))
          .status,
      ).toBe(404);
      expect((await request("/cron/jobs")).status).toBe(200);
      const createdJob = await post("/cron/jobs", {
        name: "Native fixture job",
        schedule: "0 0 * * 0",
        prompt: "Say fixture",
        delivery: "local",
      });
      expect(createdJob.status).toBe(200);
      const { job } = (await createdJob.json()) as { job: { id: string } };
      expect(job.id).toMatch(/^[A-Za-z0-9._-]+$/u);
      expect((await post(`/cron/jobs/${job.id}/pause`, {})).status).toBe(200);
      const cronList = await request("/cron/jobs");
      expect(await cronList.json()).toMatchObject({
        jobs: expect.arrayContaining([expect.objectContaining({ id: job.id })]),
      });
      expect(
        (await request(`/cron/jobs/${job.id}`, { method: "DELETE" })).status,
      ).toBe(200);
      const oauth = await post("/accounts/oauth/start", {
        provider: "claude-code",
        label: "Fixture sign-in",
      });
      expect(oauth.status).toBe(200);
      const { flow } = (await oauth.json()) as {
        flow: { id: string; authUrl: string; status: string };
      };
      const authUrl = new URL(flow.authUrl);
      expect(`${authUrl.origin}${authUrl.pathname}`).toBe(
        "https://claude.ai/oauth/authorize",
      );
      expect(flow.status).toBe("pending");
      expect(
        (
          await post("/accounts/oauth/code", {
            flowId: flow.id,
            code: "fixture#wrong-state",
          })
        ).status,
      ).toBe(400);
      expect(
        await (
          await request(`/accounts/oauth/status?flowId=${flow.id}`)
        ).json(),
      ).toMatchObject({ flow: { status: "pending" } });
      expect(
        await (
          await post("/accounts/oauth/cancel", { flowId: flow.id })
        ).json(),
      ).toMatchObject({ flow: { status: "cancelled" } });
      expect(
        (await request(`/accounts/oauth/status?flowId=${randomUUID()}`)).status,
      ).toBe(404);
      const file = await request("/workspace/read?path=native-note.txt");
      expect(file.status).toBe(200);
      expect(await file.json()).toMatchObject({ content: "workspace witness" });
      expect((await post("/acp/session/new", { cwd: sandbox })).status).toBe(
        400,
      );
      const acp = await post("/acp/session/new", { cwd: workspace });
      expect(acp.status).toBe(200);
      const {
        session: { sessionId: acpId },
      } = (await acp.json()) as { session: { sessionId: string } };
      expect(acpId).toMatch(/^acp:/u);
      expect(
        await (
          await post("/acp/fs/read", {
            sessionId: acpId,
            path: "native-note.txt",
          })
        ).json(),
      ).toMatchObject({ content: "workspace witness" });
      expect(
        (
          await post("/acp/fs/write", {
            sessionId: acpId,
            path: "native-note.txt",
            content: "unexpected",
          })
        ).status,
      ).toBe(404);

      const blockedCommand = await request("/chat/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "/workspace write native-note.txt :: changed",
        }),
      });
      expect(blockedCommand.status).toBe(403);

      const sessionId = randomUUID();
      const save = (
        path: string,
        expectedContent: string,
        content: string,
        session?: string,
      ) =>
        request("/workspace/write", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(session ? { "x-doolittle-origin-conversation": session } : {}),
          },
          body: JSON.stringify({ path, expectedContent, content }),
        });
      expect(
        (await save("native-note.txt", "workspace witness", "unused")).status,
      ).toBe(400);
      expect(
        (
          await request("/workspace/write", {
            method: "POST",
            headers: {
              Authorization: "",
              "x-doolittle-origin-conversation": sessionId,
            },
          })
        ).status,
      ).toBe(401);
      for (const [excluded, text] of [
        [".env", "fixture-only=value"],
        ["dist/generated.txt", "generated"],
        ["native-note.txt ", "workspace witness"],
      ] as const) {
        expect((await save(excluded, text, "unused", sessionId)).status).toBe(
          400,
        );
      }
      const stale = await save(
        "native-note.txt",
        "older version",
        "unused",
        sessionId,
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ conflict: true });
      for (const unsafePath of [
        "../outside.txt",
        ...(process.platform === "win32" ? [] : ["alias.txt"]),
      ]) {
        expect(
          (await save(unsafePath, "do not change", "unused", sessionId)).status,
        ).toBe(400);
      }
      expect(await readFile(join(sandbox, "outside.txt"), "utf8")).toBe(
        "do not change",
      );
      const saved = await save(
        "native-note.txt",
        "workspace witness",
        "updated witness",
        sessionId,
      );
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({
        path: await realpath(join(workspace, "native-note.txt")),
      });
      expect(await readFile(join(workspace, "native-note.txt"), "utf8")).toBe(
        "updated witness",
      );

      const repository = await realpath(workspace);
      const repositoryMutation = (mutation: Record<string, unknown>) =>
        post("/repo/mutate", { workspace: repository, ...mutation });
      expect(await (await request("/repo/summary")).json()).toMatchObject({
        summary: { root: repository },
      });
      expect(
        await (
          await repositoryMutation({
            type: "stage",
            paths: ["[ab].txt"],
            workspace: sandbox,
          })
        ).json(),
      ).toMatchObject({ code: "repository_scope_mismatch" });
      expect(
        (await repositoryMutation({ type: "stage", paths: [":(glob)*"] }))
          .status,
      ).toBe(400);
      const commitWithoutConfirmation = await repositoryMutation({
        type: "commit",
        message: "No confirmation",
      });
      expect(commitWithoutConfirmation.status).toBe(403);
      expect(await commitWithoutConfirmation.json()).toMatchObject({
        code: "repository_confirmation_required",
      });
      expect((await repositoryMutation({ type: "fetch" })).status).toBe(403);
      expect(
        await (
          await repositoryMutation({ type: "stage", paths: ["[ab].txt"] })
        ).json(),
      ).toMatchObject({ result: { type: "stage", ok: true } });
      expect(git("diff", "--cached", "--name-only")).toBe("[ab].txt");
      expect(
        await (
          await repositoryMutation({ type: "unstage", paths: ["[ab].txt"] })
        ).json(),
      ).toMatchObject({ result: { type: "unstage", ok: true } });
      expect(git("diff", "--cached", "--name-only")).toBe("");
      expect(
        await (
          await repositoryMutation({
            type: "stage",
            paths: ["native-note.txt"],
          })
        ).json(),
      ).toMatchObject({ result: { type: "stage", ok: true } });
      expect(
        await (
          await repositoryMutation({
            type: "commit",
            message: "Native Git fixture commit",
            confirmed: true,
          })
        ).json(),
      ).toMatchObject({ result: { type: "commit", ok: true } });
      expect(git("log", "-1", "--format=%s")).toBe("Native Git fixture commit");
      expect(git("status", "--short")).toContain("a.txt");

      const runId = randomUUID();
      const submitted = await request("/chat/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: sessionId,
          runId,
          message: "/workspace tree",
          source: "pretend-connector",
          userId: "pretend-user",
        }),
      });
      expect(submitted.status).toBe(202);
      await vi.waitFor(
        async () => {
          const receipt = await request(`/chat/runs/${runId}`);
          const { run } = (await receipt.json()) as {
            run: { status: string; sessionId: string; source: string };
          };
          expect(run.sessionId).toBe(sessionId);
          expect(run.source).toBe("cli");
          expect(run.status).toBe("complete");
        },
        { timeout: 25_000, interval: 100 },
      );

      const events = await request(`/chat/runs/${runId}/events`);
      expect(events.status).toBe(200);
      const commandEvents = await events.text();
      expect(commandEvents).toContain("native-note.txt");
      expect(commandEvents).toContain("event: response.completed");

      const normalId = randomUUID();
      const importedAttachments = await post("/media/attachments/import", {
        paths: [join(workspace, "native-note.txt")],
      });
      expect(importedAttachments.status).toBe(200);
      const { attachments } = (await importedAttachments.json()) as {
        attachments: { id: string }[];
      };
      expect(attachments).toHaveLength(1);
      const conversation = await request("/chat/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: sessionId,
          runId: normalId,
          message: "Say hello for native acceptance.",
          attachmentIds: attachments.map(({ id }) => id),
        }),
      });
      expect(conversation.status).toBe(202);
      const stream = await request(`/chat/runs/${normalId}/events`);
      expect(stream.status).toBe(200);
      const conversationEvents = await stream.text();
      expect(conversationEvents).toContain("event: response.completed");
      expect(conversationEvents).toContain("model provider is unavailable");
      expect(
        await (
          await request(`/sessions/messages?sessionId=${sessionId}`)
        ).json(),
      ).toMatchObject({
        messages: expect.arrayContaining([
          expect.objectContaining({
            attachments: expect.arrayContaining([
              expect.objectContaining({ id: attachments[0]?.id }),
            ]),
          }),
        ]),
      });

      expect(
        (
          await save(
            "native-note.txt",
            "updated witness",
            "updated witness",
            sessionId,
          )
        ).status,
      ).toBe(200);

      const credential = "fixture-key-not-a-real-api-secret";
      const importedAccount = await post(
        "/runtime/account-pool/openai-api/credentials",
        {
          accountId: "fixture-imported",
          label: "Fixture account",
          apiKey: credential,
        },
      );
      expect(importedAccount.status).toBe(200);
      const newAccount = await importedAccount.text();
      expect(newAccount).toContain("fixture-imported");
      expect(newAccount).not.toContain(credential);
      expect(
        await (await request("/runtime/account-pool")).text(),
      ).not.toContain(credential);

      child.stdin.end();
      await vi.waitFor(() => expect(child.exitCode).not.toBeNull(), {
        timeout: 10_000,
        interval: 100,
      });
      expect(child.exitCode, runtimeErrors).toBe(0);
      await exit;
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exit;
      output.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  },
  70_000,
);
