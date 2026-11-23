import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pendingInputRequestsForSession } from "../../apps/desktop/src/renderer/chat/session-input-requests";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { isUserDirectedQuestion } from "../../packages/agent/src/runtime/chat-turn/workspace-continuation";
import { handleSettingsExecutionRoutes } from "../../packages/agent/src/server/routes/settings-execution";
import {
  formatInputAnswerSubmission,
  UserInputRequestService,
} from "../../packages/agent/src/services/user-input/service";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function service(): UserInputRequestService {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-input-requests-"));
  dirs.push(dir);
  return new UserInputRequestService(dir);
}

function fixture() {
  const inputRequests = service();
  const context = {
    services: { inputRequests },
  } as unknown as AppContext;
  const route = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = new URL(path, "http://127.0.0.1");
    const response = await handleSettingsExecutionRoutes(
      context,
      new Request(url, init),
      url,
    );
    if (!response) throw new Error("Input request route did not match.");
    return response;
  };
  const questions = [
    {
      question: "Who should this serve first?",
      header: "Audience",
      options: [
        { label: "Solo builders" },
        { label: "Teams", description: "Multiple managed agents" },
      ],
      multiSelect: false,
    },
    {
      question: "How should customers pay?",
      options: [
        { label: "Per address" },
        { label: "Subscription" },
        { label: "Credits" },
      ],
      multiSelect: true,
    },
  ];
  const request = inputRequests.request({
    roomId: "room-a",
    sessionId: "room-a",
    runId: "run-1",
    botId: "bot-1",
    mutationObligation: true,
    questions,
  });
  return { inputRequests, route, request, questions };
}

describe("UserInputRequestService", () => {
  it("creates, lists, answers, and persists requests", () => {
    const inputRequests = service();
    const record = inputRequests.request({
      roomId: "room-a",
      sessionId: "room-a",
      runId: "run-1",
      questions: [
        {
          question: "Pick one?",
          options: [{ label: "A" }, { label: "B" }],
          multiSelect: false,
        },
      ],
    });
    expect(record.status).toBe("pending");
    expect(inputRequests.list("pending", "room-a")).toHaveLength(1);
    expect(inputRequests.list("pending", "room-b")).toHaveLength(0);
    expect(inputRequests.latestPendingForSession("room-a")?.id).toBe(record.id);
    expect(inputRequests.pendingForRun("run-1")?.id).toBe(record.id);

    const answered = inputRequests.answer(record.id, [
      { question: "Pick one?", selected: ["A"] },
    ]);
    expect(answered.status).toBe("answered");
    expect(answered.resolvedAt).toBeTruthy();
    expect(answered.answers?.[0]?.selected).toEqual(["A"]);
    expect(inputRequests.list("pending", "room-a")).toHaveLength(0);
    expect(() =>
      inputRequests.answer(record.id, [
        { question: "Pick one?", selected: ["B"] },
      ]),
    ).toThrow(/already answered/u);
  });

  it("supersedes pending requests for a session but keeps other rooms", () => {
    const inputRequests = service();
    const a = inputRequests.request({
      roomId: "room-a",
      sessionId: "room-a",
      questions: [{ question: "One?", options: [], multiSelect: false }],
    });
    const b = inputRequests.request({
      roomId: "room-b",
      sessionId: "room-b",
      questions: [{ question: "Two?", options: [], multiSelect: false }],
    });
    expect(inputRequests.supersedePendingForSession("room-a")).toBe(1);
    expect(inputRequests.get(a.id)?.status).toBe("superseded");
    expect(inputRequests.get(b.id)?.status).toBe("pending");
    expect(inputRequests.supersedePendingForSession("room-a")).toBe(0);
  });

  it("dismisses a pending request and rejects a second resolution", () => {
    const inputRequests = service();
    const record = inputRequests.request({
      roomId: "room-a",
      questions: [{ question: "One?", options: [], multiSelect: false }],
    });
    expect(inputRequests.dismiss(record.id).status).toBe("dismissed");
    expect(() => inputRequests.dismiss(record.id)).toThrow(
      /already dismissed/u,
    );
  });
});

describe("formatInputAnswerSubmission", () => {
  it("keeps the mutation obligation in the continuation message", () => {
    const { inputRequests, request } = fixture();
    const message = formatInputAnswerSubmission(request, [
      { question: "Who?", selected: ["Teams"] },
      { question: "Pay?", selected: ["Subscription"], customText: "annual" },
    ]);
    expect(message).toContain("Implement the requested project work");
    expect(message).toContain("1. Who?: Teams");
    expect(message).toContain("2. Pay?: Subscription — annual");
    expect(inputRequests.get(request.id)?.status).toBe("pending");
  });

  it("uses the plain continuation intro without a mutation obligation", () => {
    const inputRequests = service();
    const record = inputRequests.request({
      roomId: "room-a",
      questions: [{ question: "One?", options: [], multiSelect: false }],
    });
    expect(
      formatInputAnswerSubmission(record, [{ question: "One?", selected: [] }]),
    ).toContain("My decisions for your questions:");
  });
});

describe("input request routes", () => {
  it("lists pending requests filtered by room", async () => {
    const { route } = fixture();
    const response = await route(
      "/execution/input-requests?status=pending&roomId=room-a",
      { method: "GET" },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { requests: unknown[] };
    expect(body.requests).toHaveLength(1);
    const other = await route(
      "/execution/input-requests?status=pending&roomId=room-b",
      { method: "GET" },
    );
    expect(
      ((await other.json()) as { requests: unknown[] }).requests,
    ).toHaveLength(0);
  });

  it("rejects an unknown status filter", async () => {
    const { route } = fixture();
    const response = await route("/execution/input-requests?status=bogus", {
      method: "GET",
    });
    expect(response.status).toBe(400);
  });

  it("answers a request once and returns the continuation message", async () => {
    const { route, request } = fixture();
    const response = await route(
      `/execution/input-requests/${request.id}/answer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: [
            { question: "x", selected: ["Teams"] },
            { question: "y", selected: ["Subscription"], customText: "annual" },
          ],
        }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      request: { status: string; answers?: { question: string }[] };
      message: string;
    };
    expect(body.request.status).toBe("answered");
    // The route pairs answers positionally with the record's questions.
    expect(body.request.answers?.[0]?.question).toBe(
      "Who should this serve first?",
    );
    expect(body.message).toContain("Implement the requested project work");

    const replay = await route(
      `/execution/input-requests/${request.id}/answer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: [{ selected: ["A"] }] }),
      },
    );
    expect(replay.status).toBe(409);
  });

  it("rejects answers that do not match the question count", async () => {
    const { route, request } = fixture();
    const tooMany = await route(
      `/execution/input-requests/${request.id}/answer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: [
            { selected: ["A"] },
            { selected: ["B"] },
            { selected: ["C"] },
          ],
        }),
      },
    );
    expect(tooMany.status).toBe(400);
    const malformed = await route(
      `/execution/input-requests/${request.id}/answer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: "nope" }),
      },
    );
    expect(malformed.status).toBe(400);
  });

  it("returns 404 for unknown ids and dismisses pending requests", async () => {
    const { route, request } = fixture();
    const missing = await route(
      "/execution/input-requests/does-not-exist/answer",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: [{ selected: [] }] }),
      },
    );
    expect(missing.status).toBe(404);
    const dismissed = await route(
      `/execution/input-requests/${request.id}/dismiss`,
      { method: "POST" },
    );
    expect(dismissed.status).toBe(200);
    expect(
      ((await dismissed.json()) as { request: { status: string } }).request
        .status,
    ).toBe("dismissed");
    const again = await route(
      `/execution/input-requests/${request.id}/dismiss`,
      { method: "POST" },
    );
    expect(again.status).toBe(409);
  });
});

describe("isUserDirectedQuestion", () => {
  it("accepts a response whose substance is questions to the user", () => {
    expect(
      isUserDirectedQuestion(
        "Before I touch the repo, three questions: 1. Who first — solo builders or teams? 2. Is the main flow sign up then pick an agent? 3. How should customers pay?",
      ),
    ).toBe(true);
    expect(isUserDirectedQuestion("What should I build first?")).toBe(true);
  });

  it("rejects completion claims even when they end with a question", () => {
    expect(
      isUserDirectedQuestion(
        "I've completed the dashboard rebuild and all tests pass. Want me to commit it?",
      ),
    ).toBe(false);
    expect(
      isUserDirectedQuestion(
        "The landing page is now complete. Ready for review — anything else?",
      ),
    ).toBe(false);
  });

  it("rejects incomplete-work admissions and non-questions", () => {
    expect(
      isUserDirectedQuestion(
        "The build hasn't been verified yet — should I keep going?",
      ),
    ).toBe(false);
    expect(isUserDirectedQuestion("I'll get started on it.")).toBe(false);
    expect(isUserDirectedQuestion("")).toBe(false);
  });
});

describe("pendingInputRequestsForSession", () => {
  it("matches only pending requests for the exact room", () => {
    const { request } = fixture();
    const resolved = { ...request, status: "answered" };
    const other = { ...request, id: "req-2", roomId: "room-b" };
    expect(
      pendingInputRequestsForSession(
        [request, resolved, other, "junk", null],
        "room-a",
      ).map((record) => record.id),
    ).toEqual([request.id]);
    expect(pendingInputRequestsForSession([request], "room-b")).toHaveLength(0);
    expect(pendingInputRequestsForSession(undefined, "room-a")).toHaveLength(0);
  });

  it("drops requests with malformed ids or questions", () => {
    const { request } = fixture();
    const badId = { ...request, id: "../escape" };
    const noQuestions = { ...request, id: "req-3", questions: [] };
    expect(
      pendingInputRequestsForSession([badId, noQuestions], "room-a"),
    ).toHaveLength(0);
  });
});
