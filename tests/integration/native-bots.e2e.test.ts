import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const root = fileURLToPath(new URL("../../", import.meta.url));

it.runIf(process.env.DOOLITTLE_RUN_RUNTIME_E2E === "1")(
  "starts, stops and persists a native named bot using the actual isolated SDK worker",
  async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "doolittle-native-bots-"));
    const profile = join(sandbox, "data");
    const workspace = join(sandbox, "workspace");
    const trace = join(sandbox, "owned-http-requests.jsonl");
    const observer = join(sandbox, "observe-owned-fetch.mjs");
    await mkdir(profile, { mode: 0o700 });
    await mkdir(workspace, { mode: 0o700 });
    // Observe test-owned runtime endpoints without publishing a worker URL or
    // capability in the product API. The trace stores only origins and status.
    await writeFile(
      observer,
      `import { appendFileSync } from "node:fs";
import { isMainThread } from "node:worker_threads";
if (isMainThread) {
  const fetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await fetch(input, init);
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.protocol === "http:" && url.hostname === "127.0.0.1" &&
        url.pathname === "/chat/runs" && url.search === "?limit=100") {
      appendFileSync(${JSON.stringify(trace)}, JSON.stringify({
        origin: url.origin,
        status: response.status,
        bearerSet: new Headers(init?.headers).has("authorization"),
      }) + "\\n", { mode: 0o600 });
    }
    return response;
  };
}
`,
      { mode: 0o600 },
    );
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
      [
        "--import",
        pathToFileURL(observer).href,
        join(root, "apps/cli/dist/index.js"),
        "native-api",
      ],
      {
        cwd: root,
        env: {
          ...isolatedRuntimeEnvironment(profile),
          DOOLITTLE_REPO_ROOT: sandbox,
          DOOLITTLE_WORKSPACE_DIR: workspace,
          DOOLITTLE_NATIVE_CONTROL_PLANE: "1",
          ELIZA_API_TOKEN: token,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const exit = new Promise<number | null>((resolve) =>
      child.once("close", resolve),
    );
    const output = createInterface({ input: child.stdout });
    let endpoint: string | undefined;
    output.on("line", (line) => {
      if (!line.startsWith("DOOLITTLE_NATIVE_READY ")) return;
      const { url } = JSON.parse(
        line.slice("DOOLITTLE_NATIVE_READY ".length),
      ) as { url: string };
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
      const request = (path: string, method = "GET", body?: unknown) =>
        fetch(`${endpoint}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
      expect((await fetch(`${endpoint}/bots`)).status).toBe(401);
      const before = await request("/bots");
      expect(before.status).toBe(200);
      expect((await before.json()).bots).toHaveLength(1);
      expect(
        (
          await request("/bots", "POST", {
            name: "Cross-root",
            persona: "Fixture",
            workspacePath: workspace,
            permissions: { allowMutation: true },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request("/bots", "POST", {
            name: "Unapproved provider",
            persona: "Fixture",
            model: { provider: "openai", model: "test" },
          })
        ).status,
      ).toBe(400);
      const created = await request("/bots", "POST", {
        name: "Fixture Worker",
        persona: "Read only.",
      });
      expect(created.status).toBe(201);
      const record = (await created.json()) as {
        id: string;
        state: string;
        workspacePath: string;
      };
      expect(record.state).toBe("stopped");
      expect(record.workspacePath).toBe(
        await realpath(join(profile, "bot-workspaces", record.id)),
      );
      const activate = await request(`/bots/${record.id}/activate`, "POST");
      const running = await activate.json();
      expect(activate.status, JSON.stringify(running)).toBe(200);
      expect(running.state).toBe("ready");
      expect(running).not.toHaveProperty("url");
      expect(
        (await stat(join(profile, "bots", record.id, "pglite"))).isDirectory(),
      ).toBe(true);
      const listed = await request("/bots");
      expect(listed.status, await listed.clone().text()).toBe(200);
      expect(
        (await listed.json()).bots.find(
          (bot: { id: string }) => bot.id === record.id,
        )?.state,
      ).toBe("ready");
      const workerRequests = (await readFile(trace, "utf8"))
        .trim()
        .split("\n")
        .map(
          (entry) =>
            JSON.parse(entry) as {
              origin: string;
              status: number;
              bearerSet: boolean;
            },
        )
        .filter(({ origin }) => origin !== endpoint);
      expect(workerRequests).toHaveLength(1);
      const workerRequest = workerRequests[0];
      expect(workerRequest).toMatchObject({ status: 200, bearerSet: true });
      const direct = await fetch(
        `${workerRequest.origin}/chat/runs?limit=100`,
        {
          signal: AbortSignal.timeout(5_000),
        },
      );
      expect(direct.status).toBe(401);
      await direct.body?.cancel();
      expect((await request(`/bots/${record.id}/conversations`)).status).toBe(
        404,
      );
      expect(
        (
          await request(`/bots/${record.id}`, "PATCH", {
            name: "Changing a running bot",
          })
        ).status,
      ).toBe(409);
      const stop = await request(`/bots/${record.id}/stop`, "POST");
      expect(stop.status).toBe(200);
      expect((await stop.json()).state).toBe("stopped");
      const persisted = JSON.parse(
        await readFile(join(profile, "bots/catalog.json"), "utf8"),
      );
      expect(persisted.bots[0].id).toBe(record.id);
      expect(persisted.bots[0].permissions).toMatchObject({
        allowMutation: false,
        allowDelegation: false,
        connectionIds: [],
      });
      const restarted = await request(`/bots/${record.id}/activate`, "POST");
      expect(restarted.status, await restarted.clone().text()).toBe(200);
    } finally {
      child.stdin.end();
      const timer = setTimeout(() => child.kill("SIGKILL"), 6_000);
      const code = await exit;
      clearTimeout(timer);
      output.close();
      await rm(sandbox, { recursive: true, force: true });
      expect(code).toBe(0);
    }
  },
  100_000,
);
