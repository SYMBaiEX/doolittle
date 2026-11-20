import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
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
    await writeFile(join(workspace, "native-note.txt"), "workspace witness");
    await writeFile(
      join(profile, "settings.json"),
      JSON.stringify({
        model: {
          provider: "offline",
          model: "offline",
          baseUrl: "",
          temperature: 0,
          maxTokens: 512,
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
          ...isolatedRuntimeEnvironment(profile),
          DOOLITTLE_REPO_ROOT: sandbox,
          DOOLITTLE_WORKSPACE_DIR: workspace,
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
    output.on("line", (line) => {
      if (!line.startsWith("DOOLITTLE_NATIVE_READY ")) return;
      const { url } = JSON.parse(
        line.slice("DOOLITTLE_NATIVE_READY ".length),
      ) as {
        url: string;
      };
      if (/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(url)) endpoint = url;
    });
    child.stderr.resume();
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

      expect((await fetch(`${endpoint}/health`)).status).toBe(401);
      expect(
        (
          await request("/health", {
            headers: { Origin: "https://example.com" },
          })
        ).status,
      ).toBe(403);
      expect((await request("/health")).status).toBe(200);
      expect(
        (await request("/workspace/write", { method: "POST" })).status,
      ).toBe(404);
      const file = await request("/workspace/read?path=native-note.txt");
      expect(file.status).toBe(200);
      expect(await file.json()).toMatchObject({ content: "workspace witness" });

      const blockedCommand = await request("/chat/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "/workspace write native-note.txt :: changed",
        }),
      });
      expect(blockedCommand.status).toBe(403);

      const sessionId = randomUUID();
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
      const conversation = await request("/chat/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: sessionId,
          runId: normalId,
          message: "Say hello for native acceptance.",
        }),
      });
      expect(conversation.status).toBe(202);
      const stream = await request(`/chat/runs/${normalId}/events`);
      expect(stream.status).toBe(200);
      const conversationEvents = await stream.text();
      expect(conversationEvents).toContain("event: response.completed");
      expect(conversationEvents).toContain("model provider is unavailable");

      child.stdin.end();
      await vi.waitFor(() => expect(child.exitCode).toBe(0), {
        timeout: 10_000,
        interval: 100,
      });
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
