import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
    const raceRoom = randomUUID();
    const leadLookupDone = join(sandbox, "lead-lookup-done");
    const leadLookupRelease = join(sandbox, "lead-lookup-release");
    await mkdir(profile, { mode: 0o700 });
    await mkdir(workspace, { mode: 0o700 });
    // Observe test-owned runtime endpoints without publishing a worker URL or
    // capability in the product API. The trace stores only origins and status.
    await writeFile(
      observer,
      `import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
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
    if (url.pathname === "/sessions/summary" && url.searchParams.get("sessionId") === ${JSON.stringify(raceRoom)}) {
      // Deliver the actual stale lead lookup only after the lead wins ownership.
      writeFileSync(${JSON.stringify(leadLookupDone)}, "1", { mode: 0o600 });
      const deadline = Date.now() + 8_000;
      while (!existsSync(${JSON.stringify(leadLookupRelease)}) && Date.now() < deadline)
        await delay(10);
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
      const second = await request("/bots", "POST", {
        name: "Second Fixture Worker",
        persona: "An independent private worker.",
      });
      expect(second.status).toBe(201);
      const other = (await second.json()) as {
        id: string;
        workspacePath: string;
      };
      const otherStarted = await request(`/bots/${other.id}/activate`, "POST");
      expect(otherStarted.status, await otherStarted.clone().text()).toBe(200);

      const leadSession = randomUUID();
      const leadRun = randomUUID();
      const leadAccepted = await request("/chat/runs", "POST", {
        roomId: leadSession,
        runId: leadRun,
        message: "Lead transcript witness",
        source: "native",
      });
      expect(leadAccepted.status).toBe(202);
      const leadStream = await request(`/chat/runs/${leadRun}/events?after=0`);
      expect(await leadStream.text()).toContain("response.completed");

      const roomA = randomUUID();
      const roomB = randomUUID();
      const runA = randomUUID();
      const runB = randomUUID();
      const named = (botId: string, resource: string) =>
        `/bots/${botId}/${resource}`;
      const start = (
        botId: string,
        roomId: string,
        runId: string,
        message: string,
      ) =>
        request(named(botId, "chat/runs"), "POST", {
          roomId,
          runId,
          message,
          source: "native",
        });
      const [forbidden, rawCommand, fresh] = await Promise.all([
        start(
          record.id,
          leadSession,
          randomUUID(),
          "Do not claim a lead-owned conversation",
        ),
        start(record.id, roomA, randomUUID(), "/workspace write witness"),
        request(
          named(
            record.id,
            `sessions/messages?sessionId=${roomA}&limit=20&offset=0`,
          ),
        ),
      ]);
      expect(forbidden.status).toBe(404);
      expect(rawCommand.status).toBe(403);
      expect(fresh.status).toBe(200);
      expect(await fresh.json()).toEqual({
        messages: [],
        hasEarlier: false,
        nextOffset: 0,
        totalMessages: 0,
      });

      const [submittedA, submittedB] = await Promise.all([
        start(
          record.id,
          roomA,
          runA,
          "Only the first private transcript should contain this.",
        ),
        start(
          other.id,
          roomB,
          runB,
          "Only the second private transcript should contain this.",
        ),
      ]);
      for (const [submitted, owner, runId, roomId] of [
        [submittedA, record.id, runA, roomA],
        [submittedB, other.id, runB, roomB],
      ] as const) {
        expect(submitted.status, await submitted.clone().text()).toBe(202);
        expect(await submitted.json()).toMatchObject({
          bot_id: owner,
          run_id: runId,
          room_id: roomId,
          events_url: named(owner, `chat/runs/${runId}/events`),
        });
      }

      const [streamA, streamB] = await Promise.all([
        request(named(record.id, `chat/runs/${runA}/events?after=0`)),
        request(named(other.id, `chat/runs/${runB}/events?after=0`)),
      ]);
      expect(streamA.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      expect(streamB.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const [framesA, framesB] = await Promise.all([
        streamA.text(),
        streamB.text(),
      ]);
      expect(framesA).toContain("response.completed");
      expect(framesA).toContain("Only the first private transcript");
      expect(framesA).not.toContain("Only the second private transcript");
      expect(framesB).toContain("response.completed");
      expect(framesB).toContain("Only the second private transcript");
      expect(framesB).not.toContain("Only the first private transcript");

      const [
        historyA,
        historyB,
        listA,
        receiptA,
        receiptB,
        wrongHistory,
        wrongRun,
        wrongSse,
        wrongCancel,
        wrongRoom,
        wrongRunId,
      ] = await Promise.all([
        request(
          named(
            record.id,
            `sessions/messages?sessionId=${roomA}&limit=20&offset=0`,
          ),
        ),
        request(
          named(
            other.id,
            `sessions/messages?sessionId=${roomB}&limit=20&offset=0`,
          ),
        ),
        request(named(record.id, "sessions?limit=100")),
        request(named(record.id, `chat/runs/${runA}`)),
        request(named(other.id, `chat/runs/${runB}`)),
        request(named(other.id, `sessions/messages?sessionId=${roomA}`)),
        request(named(other.id, `chat/runs/${runA}`)),
        request(named(other.id, `chat/runs/${runA}/events`)),
        request(named(other.id, `chat/runs/${runA}/cancel`), "POST"),
        start(
          other.id,
          roomA,
          randomUUID(),
          "This room belongs to the first bot.",
        ),
        start(other.id, roomB, runA, "This run belongs to the first bot."),
      ]);
      const [transcriptA, transcriptB] = await Promise.all([
        historyA.text(),
        historyB.text(),
      ]);
      expect(transcriptA).toContain("Only the first private transcript");
      expect(transcriptA).not.toContain("Only the second private transcript");
      expect(transcriptB).toContain("Only the second private transcript");
      expect(transcriptB).not.toContain("Only the first private transcript");
      expect(await listA.json()).toMatchObject({
        sessions: [{ sessionId: roomA, botId: record.id }],
      });
      expect(await receiptA.json()).toMatchObject({
        run: { botId: record.id, sessionId: roomA, runId: runA },
      });
      expect(await receiptB.json()).toMatchObject({
        run: { botId: other.id, sessionId: roomB, runId: runB },
      });
      for (const response of [
        wrongHistory,
        wrongRun,
        wrongSse,
        wrongCancel,
        wrongRoom,
        wrongRunId,
      ])
        expect(response.status).toBe(404);
      for (const [roomId, runId] of [
        [roomA, randomUUID()],
        [randomUUID(), runA],
      ]) {
        const wrongLead = await request("/chat/runs", "POST", {
          roomId,
          runId,
          message: "Named IDs are reserved.",
          source: "native",
        });
        expect(wrongLead.status).toBe(409);
        expect(await wrongLead.json()).toMatchObject({
          code: "conversation_owner_conflict",
        });
      }
      const loseRace = start(
        other.id,
        raceRoom,
        randomUUID(),
        "Named loses to a durable lead reservation.",
      );
      const raceLeadRun = randomUUID();
      try {
        await vi.waitFor(() => stat(leadLookupDone), {
          timeout: 5_000,
          interval: 50,
        });
        const winsRace = await request("/chat/runs", "POST", {
          roomId: raceRoom,
          runId: raceLeadRun,
          message: "Lead owns this room.",
          source: "native",
        });
        expect(winsRace.status, await winsRace.clone().text()).toBe(202);
      } finally {
        await writeFile(leadLookupRelease, "1", { mode: 0o600 });
      }
      expect((await loseRace).status).toBe(404);
      const raceStream = await request(
        `/chat/runs/${raceLeadRun}/events?after=0`,
      );
      expect(await raceStream.text()).toContain("response.completed");
      const cancellation = await request(
        named(other.id, `chat/runs/${runB}/cancel`),
        "POST",
      );
      expect(await cancellation.json()).toMatchObject({
        accepted: true,
        run: { botId: other.id, sessionId: roomB, runId: runB },
      });
      expect(
        (
          await request(
            named(record.id, "workspace/read?path=first-private-witness.txt"),
          )
        ).status,
      ).toBe(404);
      const stop = await request(`/bots/${record.id}/stop`, "POST");
      expect(stop.status).toBe(200);
      expect((await stop.json()).state).toBe("stopped");
      const passiveStopped = await Promise.all([
        request(named(record.id, "sessions")),
        request(named(record.id, `sessions/messages?sessionId=${roomA}`)),
        request(named(record.id, `chat/runs/${runA}`)),
        start(record.id, roomA, randomUUID(), "Keep this worker stopped."),
      ]);
      for (const response of passiveStopped) {
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: "named_bot_stopped",
        });
      }
      const idleList = await request("/bots");
      expect(
        (await idleList.json()).bots.find(
          (bot: { id: string }) => bot.id === record.id,
        )?.state,
      ).toBe("stopped");
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
      const restored = await request(
        named(record.id, `sessions/messages?sessionId=${roomA}`),
      );
      expect(restored.status).toBe(200);
      expect(await restored.text()).toContain(
        "Only the first private transcript",
      );
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
