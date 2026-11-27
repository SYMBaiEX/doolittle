import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTerminalProfile,
  destroyTerminalSession,
  resolveNubExecutable,
  sourceCliEntry,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

const BOOT_TIMEOUT_MS = 45_000;
const PAGE_UP = "\x1b[5~";
const TAIL_MARKER = "R18LINE-42";
const HIDDEN_TAIL_MARKER = "R18HIDDEN-42";

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;
let server: Server | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
  if (server) {
    await new Promise((done) => server?.close(() => done(undefined)));
  }
  server = undefined;
});

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function waitUntil(
  description: string,
  condition: () => Promise<boolean> | boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise((done) => setTimeout(done, 50));
  }
}

async function waitForCockpitResize(
  session: TerminalSession,
  cols: number,
): Promise<void> {
  // Row 3 is the Conversation panel's top border in every supported cockpit
  // layout. xterm resizes immediately while the child repaints asynchronously;
  // the old interior cell at the new right edge becomes a border corner only
  // after the child has processed SIGWINCH and repainted the layout.
  await waitUntil(`cockpit repaint at ${cols} columns`, async () => {
    const cell = await session.cellAt(cols - 1, 3);
    return cell?.chars === "┐";
  });
}

function completionContextFrom(body: string) {
  const match =
    body.match(/completion_source_set[^0-9a-f]*([0-9a-f]{64})/i) ??
    body.match(/sourceSetId[^0-9a-f]*([0-9a-f]{64})/i);
  return {
    mode: "all_prior_dialogue",
    sourceSetId: match?.[1] ?? "",
    complete: false,
    relevantSourceIds: [],
    constraintSourceIds: [],
    referentSourceIds: [],
    pendingIntentSourceIds: [],
  };
}

function responseArguments(replyText: string, body: string) {
  return {
    shouldRespond: "RESPOND",
    contexts: ["simple"],
    contextRequests: [],
    intents: [],
    completionContext: completionContextFrom(body),
    replyText,
    replyEffectStatus: "none",
    candidateActionNames: [],
    facts: [],
    relationships: [],
    topics: [],
    addressedTo: [],
    emotion: "none",
  };
}

function ndjsonChunk(content: string, done = false, toolCalls?: unknown) {
  return `${JSON.stringify({
    model: "stress-model",
    created_at: new Date().toISOString(),
    done,
    done_reason: done ? "stop" : undefined,
    message: {
      role: "assistant",
      content,
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    },
    prompt_eval_count: 10,
    eval_count: 5,
  })}\n`;
}

function longTranscriptText(markerPrefix = "R18LINE"): string {
  return Array.from(
    { length: 42 },
    (_, index) =>
      `${markerPrefix}-${String(index + 1).padStart(2, "0")} streaming token payload with a fairly long line that exercises wrapping and transcript repaint behavior.`,
  ).join("\n");
}

async function startMockOllama(): Promise<string> {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "";
      if (req.method === "GET" && path.endsWith("/api/tags")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ models: [{ name: "stress-model" }] }));
        return;
      }
      if (req.method === "POST" && path.endsWith("/api/embed")) {
        let inputCount = 1;
        try {
          const parsed = JSON.parse(body) as { input?: unknown };
          inputCount = Array.isArray(parsed.input) ? parsed.input.length : 1;
        } catch {}
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            model: "stress-model",
            embeddings: Array.from({ length: inputCount }, () =>
              Array.from({ length: 8 }, (_, index) => (index + 1) / 8),
            ),
            total_duration: 1,
            load_duration: 1,
            prompt_eval_count: 1,
          }),
        );
        return;
      }
      if (req.method === "POST" && path.endsWith("/api/chat")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/x-ndjson");
        const wantsHandleResponse = body.includes("HANDLE_RESPONSE");
        const wantsLong = body.includes("R18STREAM");
        const longText = longTranscriptText(
          body.includes("hidden pin restore") ? "R18HIDDEN" : "R18LINE",
        );
        const replyText = wantsLong ? longText : "ok";
        const toolCalls =
          wantsHandleResponse && !wantsLong
            ? [
                {
                  id: "tool-hr",
                  function: {
                    name: "HANDLE_RESPONSE",
                    arguments: responseArguments(replyText, body),
                  },
                },
              ]
            : undefined;
        const write = (index: number) => {
          if (!wantsLong) {
            res.end(ndjsonChunk("", true, toolCalls));
            return;
          }
          const pieces = longText.match(/[\s\S]{1,90}/g) ?? [longText];
          if (index < pieces.length) {
            res.write(ndjsonChunk(pieces[index], false));
            setTimeout(() => write(index + 1), 5);
            return;
          }
          res.end(ndjsonChunk("", true, toolCalls));
        };
        write(0);
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
  const activeServer = server;
  if (!activeServer) throw new Error("mock Ollama server did not start");
  await new Promise<void>((done) => activeServer.listen(0, "127.0.0.1", done));
  const port = (activeServer.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}/api`;
}

async function bootStreamingCockpit(): Promise<TerminalSession> {
  const endpoint = await startMockOllama();
  writeFileSync(
    resolve(fixture.data, "settings.json"),
    JSON.stringify({
      model: {
        provider: "ollama",
        model: "stress-model",
        baseUrl: endpoint,
        temperature: 0,
        maxTokens: 4096,
      },
    }),
  );
  const session = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [sourceCliEntry, "--cli"],
    cols: 160,
    rows: 30,
    cwd: fixture.profile,
    env: {
      ...fixture.environment,
      OLLAMA_BASE_URL: endpoint,
      OLLAMA_API_ENDPOINT: endpoint,
    },
  });
  terminal = session;
  await session.waitForGridText("Doolittle is ready.", BOOT_TIMEOUT_MS);
  session.type("zzfocusprobe");
  await session.waitForGridText("zzfocusprobe", BOOT_TIMEOUT_MS);
  for (let index = 0; index < "zzfocusprobe".length; index += 1) {
    session.key("backspace");
  }
  return session;
}

async function fillTranscript(session: TerminalSession, prompt: string) {
  session.type(prompt);
  session.key("enter");
  await session.waitForGridText("run complete", 25_000);
  await session.waitForGridText(TAIL_MARKER, 10_000);
}

describe("cockpit resize scroll pinning", () => {
  it("keeps a bottom-pinned transcript at the tail across resize and too-small restoration", async () => {
    const session = await bootStreamingCockpit();
    await fillTranscript(session, "R18STREAM pin resize");

    expect(await session.gridText()).toContain(TAIL_MARKER);

    session.resize(100, 24);
    await waitForCockpitResize(session, 100);
    expect(await session.gridText()).toContain(TAIL_MARKER);

    session.resize(160, 30);
    await waitForCockpitResize(session, 160);
    expect(await session.gridText()).toContain(TAIL_MARKER);

    // Start a second overflowing turn and hide the cockpit while it is still
    // busy. Transcript renders that land during the hidden interval must not
    // erase the pre-existing bottom-pin state.
    session.type("R18STREAM hidden pin restore");
    session.key("enter");
    await session.waitForGridText("processing", 10_000);
    session.resize(70, 18);
    await session.waitForGridText("Terminal too small", 10_000);
    await sleep(500);
    session.resize(120, 30);
    await waitForCockpitResize(session, 120);
    const restoredGrid = await session.gridText();
    expect(restoredGrid).not.toContain("Terminal too small");
    expect(restoredGrid).toContain(HIDDEN_TAIL_MARKER);
  }, 120_000);

  it("does not yank a deliberately scrolled transcript to the tail across resize and restoration", async () => {
    const session = await bootStreamingCockpit();
    await fillTranscript(session, "R18STREAM deliberate scroll resize");

    // Ctrl-S focuses Conversation; PageUp is the deliberate operator scroll.
    session.type("\x13");
    await session.waitForGridText("scroll conversation", 5_000);
    session.type(PAGE_UP);
    await session.waitForGridTextAbsent(TAIL_MARKER, 5_000);
    await session.waitForGridText("R18LINE-20", 5_000);
    const scrolledGrid = await session.gridText();
    expect(scrolledGrid).toContain("R18LINE-20");
    expect(scrolledGrid).not.toContain(TAIL_MARKER);

    session.resize(100, 24);
    await waitForCockpitResize(session, 100);
    const narrowGrid = await session.gridText();
    expect(narrowGrid).toContain("R18LINE-20");
    expect(narrowGrid).not.toContain(TAIL_MARKER);

    session.resize(160, 30);
    await waitForCockpitResize(session, 160);
    const wideGrid = await session.gridText();
    expect(wideGrid).toContain("R18LINE-20");
    expect(wideGrid).not.toContain(TAIL_MARKER);

    session.resize(70, 18);
    await session.waitForGridText("Terminal too small", 10_000);
    session.resize(120, 30);
    await waitForCockpitResize(session, 120);
    const restoredGrid = await session.gridText();
    expect(restoredGrid).not.toContain("Terminal too small");
    expect(restoredGrid).toContain("R18LINE-20");
    expect(restoredGrid).not.toContain(TAIL_MARKER);
  }, 120_000);
});
