import { spawn } from "node:child_process";
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
          DOOLITTLE_NATIVE_WORKSPACE_SAVE: "1",
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
      expect((await request("/repo/mutate", { method: "POST" })).status).toBe(
        404,
      );
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
