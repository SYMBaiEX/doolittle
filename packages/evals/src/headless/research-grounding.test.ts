import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTrajectoryEventJournal,
  normalizeTrajectoryEventRecord,
} from "../../../agent/src/services/trajectory/event-journal";
import {
  pinResearchDataRoot,
  RESEARCH_JOURNAL_BYTE_LIMIT,
  RESEARCH_JOURNAL_EVENT_LIMIT,
  readResearchGrounding,
  SDK_WEB_RESEARCH_QUERY,
  SDK_WEB_RESEARCH_SOURCE,
} from "./research-grounding";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function temporary() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-research-test-")),
  );
  roots.push(root);
  return root;
}
function fixture(values = ["cached", "live", "disabled"]) {
  const task = temporary();
  const data = join(task, "data");
  mkdirSync(data, { mode: 0o700 });
  const root = pinResearchDataRoot(data);
  expect(root).toBeDefined();
  const trajectories = join(data, "trajectories");
  mkdirSync(trajectories, { mode: 0o755 });
  const path = join(trajectories, "trajectory-events.jsonl");
  const declaration = `export type WebSearchMode = ${values.map((value) => JSON.stringify(value)).join(" | ")};`;
  const source = `${declaration}\nexport type ThreadOptions = {\n  webSearchMode?: WebSearchMode;\n};\n`;
  const response = JSON.stringify({
    values,
    member: "webSearchMode",
    declaration,
    source: SDK_WEB_RESEARCH_SOURCE,
  });
  const time = (n: number) => `2026-10-03T00:00:0${n}.000Z`;
  const anchor = {
    sessionId: "cli:synthetic",
    runId: "run-synthetic",
    roomId: "native-room",
    source: "cli",
    provider: "codex",
  };
  const event = (
    n: number,
    category: string,
    name: string,
    metadata: Record<string, unknown>,
  ) => ({ ...anchor, category, event: name, createdAt: time(n), metadata });
  const action = (
    n: number,
    name: string,
    completed: boolean,
    data: Record<string, unknown> = {},
  ) =>
    event(n, "action", completed ? "action.completed" : "action.started", {
      action: name,
      ...(completed
        ? {
            status: "completed",
            success: true,
            actionResult: {
              success: true,
              text: "public result",
              data: { actionName: name, ...data },
            },
          }
        : {}),
    });
  const events = [
    event(1, "model", "model.request", {
      path: "provider-message-service",
      privateCanary: "PROMPT_CANARY",
    }),
    action(2, "WEB_SEARCH", false),
    action(3, "WEB_SEARCH", true, {
      query: SDK_WEB_RESEARCH_QUERY,
      provider: "parallel",
      value: JSON.stringify({
        results: [
          { url: "https://github.com/openai/codex", title: "Official" },
        ],
      }),
    }),
    action(4, "WEB_FETCH", false),
    action(5, "WEB_FETCH", true, {
      url: SDK_WEB_RESEARCH_SOURCE,
      value: source,
    }),
    event(6, "model", "model.response", {
      path: "provider-message-service",
      response,
      runFailureMessage: null,
    }),
  ];
  const stdout = [
    {
      type: "start",
      timestamp: time(0),
      sessionId: anchor.sessionId,
      command: "PUBLIC_QUERY_CANARY",
    },
    { type: "result", timestamp: time(7), text: response, shouldExit: false },
    { type: "completed", timestamp: time(8), status: "completed" },
  ];
  function write(rows: unknown[] = events) {
    writeFileSync(
      path,
      `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
      { mode: 0o644 },
    );
  }
  function read(
    overrides: Partial<Parameters<typeof readResearchGrounding>[0]> = {},
  ) {
    write();
    return readResearchGrounding({
      root,
      stdout: stdout.map((row) => JSON.stringify(row)).join("\n"),
      response,
      executionConfirmed: true,
      ...overrides,
    });
  }
  const completedData = (index: number) =>
    (events[index].metadata.actionResult as { data: Record<string, unknown> })
      .data;
  return {
    task,
    data,
    root,
    trajectories,
    path,
    response,
    source,
    declaration,
    events,
    stdout,
    write,
    read,
    completedData,
  };
}

describe("required SDK-web research grounding", () => {
  it("uses retrieved declaration values/order, not a hardcoded model answer; only closed evidence escapes", () => {
    const f = fixture(["live", "indexed", "cached"]);
    const output = f.read();
    expect(output).toEqual({
      provenance: "original-cli-action-journal",
      status: "verified",
      reason: "verified",
      searchReturnedData: true,
      searchOutputAtCap: false,
      primarySourceRetrieved: true,
      answerMatchesSource: true,
      citationMatches: true,
      citationClassification: "exact",
      executionIntegrity: true,
    });
    const bytes = JSON.stringify(output);
    for (const canary of [
      "PROMPT_CANARY",
      "PUBLIC_QUERY_CANARY",
      "native-room",
      "run-synthetic",
      "indexed",
      SDK_WEB_RESEARCH_SOURCE,
      SDK_WEB_RESEARCH_QUERY,
    ])
      expect(bytes).not.toContain(canary);
  });
  it("accepts synthetic Exa opaque Markdown data without claiming its live format or quality", () => {
    const f = fixture();
    f.completedData(2).provider = "exa";
    f.completedData(2).value =
      "[Synthetic result](https://foreign.invalid/example)";
    expect(f.read().status).toBe("verified");
  });
  it.each([
    ["exact", SDK_WEB_RESEARCH_SOURCE],
    ["non-string", null],
    ["non-string", 42],
    ["non-string", { private: "CITATION_SECRET_CANARY" }],
    ["non-string", [SDK_WEB_RESEARCH_SOURCE]],
    ["non-string", undefined],
    ["whitespace", ` \n${SDK_WEB_RESEARCH_SOURCE}\t `],
    [
      "github-view",
      "https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts",
    ],
    [
      "other-url",
      "https://github.com/openai/codex/blob/main/sdk/typescript/src/foreign.ts",
    ],
    [
      "other-url",
      "https://github.com/foreign/codex/blob/main/sdk/typescript/src/threadOptions.ts",
    ],
    [
      "other-url",
      "https://user:CITATION_SECRET_CANARY@foreign.invalid/private?token=CITATION_TOKEN_CANARY",
    ],
    ["non-url", "CITATION_SECRET_CANARY"],
    ["non-url", ""],
  ] as const)(
    "classifies %s without changing exact citation grading or exposing values",
    (classification, value) => {
      const f = fixture();
      const answer = { ...JSON.parse(f.response), source: value };
      const response = JSON.stringify(answer);
      f.events[5].metadata.response = response;
      f.stdout[1].text = response;
      const output = f.read({ response });
      expect(output.citationClassification).toBe(classification);
      expect(output.citationMatches).toBe(classification === "exact");
      expect(output.status === "verified").toBe(classification === "exact");
      expect(output.answerMatchesSource).toBe(value !== undefined);
      expect(output.executionIntegrity && output.primarySourceRetrieved).toBe(
        true,
      );
      const projection = JSON.stringify(output);
      for (const canary of [
        "CITATION_SECRET_CANARY",
        "CITATION_TOKEN_CANARY",
        "foreign.invalid",
        SDK_WEB_RESEARCH_SOURCE,
      ])
        expect(projection).not.toContain(canary);
    },
  );
  it("a wrong source key remains non-string and cannot pass", () => {
    const f = fixture();
    const answer = JSON.parse(f.response);
    answer.citation = answer.source;
    delete answer.source;
    const response = JSON.stringify(answer);
    f.events[5].metadata.response = response;
    f.stdout[1].text = response;
    const output = f.read({ response });
    expect(output.citationClassification).toBe("non-string");
    expect(output.citationMatches || output.answerMatchesSource).toBe(false);
  });
  it.each([
    "invalid-json",
    "non-object",
    "failed-fetch",
    "unconfirmed",
    "unsafe",
  ])("leaves classification unavailable for %s evidence", (kind) => {
    const f = fixture();
    const response =
      kind === "invalid-json"
        ? "CITATION_SECRET_CANARY"
        : kind === "non-object"
          ? "[]"
          : f.response;
    f.events[5].metadata.response = response;
    f.stdout[1].text = response;
    if (kind === "failed-fetch") f.events[4].metadata.success = false;
    const output = f.read({
      response,
      ...(kind === "unconfirmed" ? { executionConfirmed: false } : {}),
      ...(kind === "unsafe" ? { root: undefined } : {}),
    });
    expect(output.citationClassification).toBe("unavailable");
    expect(output.citationMatches).toBe(false);
    expect(JSON.stringify(output)).not.toContain("CITATION_SECRET_CANARY");
  });
  it("admits opaque JSON cut at the SDK boundary with explicit cap coverage, not complete-search proof", () => {
    const f = fixture();
    f.completedData(2).value =
      `{"results":[{"excerpt":"${"x".repeat(5000)}`.slice(0, 4000);
    expect(() => JSON.parse(f.completedData(2).value as string)).toThrow();
    const output = f.read();
    expect(output.status).toBe("verified");
    expect(output.searchReturnedData).toBe(true);
    expect(output.searchOutputAtCap).toBe(true);
    expect(output.primarySourceRetrieved).toBe(true);
    // Search's opaque cap admission never admits a source fetch at that cap.
    f.completedData(4).value = f.source.padEnd(4000, " ");
    expect(f.read().primarySourceRetrieved).toBe(false);
  });
  it.each([
    "block-comment",
    "line-comment",
    "single-string",
    "template-string",
    "commented-union",
    "commented-options",
    "double-string-options",
  ])("does not treat %s declarations as TypeScript code", (kind) => {
    const f = fixture();
    const options =
      "export type ThreadOptions = { webSearchMode?: WebSearchMode; };";
    f.completedData(4).value =
      kind === "block-comment"
        ? `/* ${f.source} */`
        : kind === "line-comment"
          ? f.source
              .split("\n")
              .map((line) => `// ${line}`)
              .join("\n")
          : kind === "single-string"
            ? `const example = '${f.source.replaceAll("\n", " ")}';`
            : kind === "template-string"
              ? `const example = \`${f.source}\`;`
              : kind === "commented-union"
                ? `/* ${f.declaration} */\n${options}`
                : kind === "commented-options"
                  ? `${f.declaration}\n/* ${options} */`
                  : `${f.declaration}\nconst example = "${options}";`;
    const output = f.read();
    expect(output.primarySourceRetrieved).toBe(false);
    expect(output.status).not.toBe("verified");
  });
  it("ignores commented/string examples while admitting actual code declarations", () => {
    const f = fixture();
    f.completedData(4).value =
      `/* ${f.source} */\nconst example = \`${f.source}\`;\n${f.source}`;
    expect(f.read().status).toBe("verified");
  });
  it.each([
    "namespace-only",
    "nested-union",
    "nested-options",
    "unclosed-brace",
    "unexpected-close",
  ])("refuses %s instead of certifying module-level exports", (kind) => {
    const f = fixture();
    const options =
      "export type ThreadOptions = { webSearchMode?: WebSearchMode; };";
    f.completedData(4).value =
      kind === "namespace-only"
        ? `export namespace Example { ${f.source} }`
        : kind === "nested-union"
          ? `export namespace Example { ${f.declaration} }\n${options}`
          : kind === "nested-options"
            ? `${f.declaration}\nexport namespace Example { ${options} }`
            : kind === "unclosed-brace"
              ? `${f.source}\nexport namespace Example {`
              : `}\n${f.source}`;
    const output = f.read();
    expect(output.primarySourceRetrieved).toBe(false);
    expect(output.status).not.toBe("verified");
  });
  it("admits top-level exports followed by other balanced declarations, ignoring non-code braces", () => {
    const f = fixture();
    f.completedData(4).value =
      `${f.source}\nexport type Other = { nested: { value: string; }; };\nconst example = "{"; /* } */`;
    expect(f.read().status).toBe("verified");
  });
  it("admits real journal producer permissions and depth/redaction-normalized original action results", () => {
    const f = fixture();
    // Let the actual producer create its directory and leaf with its defaults,
    // inside the pre-dispatch pinned private task/data boundary.
    rmSync(f.trajectories, { recursive: true });
    const journal = createTrajectoryEventJournal(f.trajectories);
    f.events[2].metadata.apiKey = "PRIVATE_PRODUCER_CANARY";
    f.completedData(2).extra = {
      a: { b: { c: { d: { e: { f: "DEPTH_CANARY" } } } } },
    };
    const normalized = normalizeTrajectoryEventRecord(f.events[2]);
    expect(normalized.metadata?.apiKey).toBe("[redacted]");
    expect(JSON.stringify(normalized.metadata)).toContain("[max-depth]");
    expect(JSON.stringify(normalized.metadata)).not.toContain("DEPTH_CANARY");
    for (const event of f.events) journal.append(event);
    const output = readResearchGrounding({
      root: f.root,
      stdout: f.stdout.map((event) => JSON.stringify(event)).join("\n"),
      response: f.response,
      executionConfirmed: true,
    });
    expect(output.status).toBe("verified");
    expect(output.searchReturnedData && output.primarySourceRetrieved).toBe(
      true,
    );
    expect(JSON.stringify(output)).not.toContain("PRIVATE_PRODUCER_CANARY");
  });
  it.each(["complete", "failed", "unbalanced"])(
    "handles %s optional final REPLY evidence",
    (kind) => {
      const f = fixture();
      const start = {
        ...f.events[4],
        metadata: { action: "REPLY" },
        event: "action.started",
      };
      const end = {
        ...start,
        event: "action.completed",
        metadata: {
          action: "REPLY",
          status: "completed",
          success: kind !== "failed",
          actionResult: { success: kind !== "failed" },
        },
      };
      f.events.splice(5, 0, start, ...(kind === "unbalanced" ? [] : [end]));
      expect(f.read().status === "verified").toBe(kind === "complete");
    },
  );
  it.each(["values", "member", "declaration", "source", "extra"])(
    "rejects answer %s disagreement",
    (field) => {
      const f = fixture();
      const answer = JSON.parse(f.response);
      answer[field] = field === "values" ? ["invented"] : "RESPONSE_CANARY";
      const response = JSON.stringify(answer);
      f.events[5].metadata.response = response;
      f.stdout[1].text = response;
      const output = f.read({ response });
      expect(output.status).toBe("failed");
      expect(output.answerMatchesSource && output.citationMatches).toBe(false);
      expect(JSON.stringify(output)).not.toContain("RESPONSE_CANARY");
    },
  );
  it.each([
    "failure",
    "empty",
    "wrong-url",
    "missing-type",
    "wrong-options-type",
    "truncated",
    "redacted",
  ])("does not certify %s fetch", (kind) => {
    const f = fixture();
    if (kind === "failure") f.events[4].metadata.success = false;
    if (kind === "empty") f.completedData(4).value = "";
    if (kind === "wrong-url")
      f.completedData(4).url = "https://foreign.invalid/CANARY";
    if (kind === "missing-type")
      f.completedData(4).value = "model asserts cached live disabled";
    if (kind === "wrong-options-type")
      f.completedData(4).value =
        `${f.declaration}\nexport type ForeignOptions = { webSearchMode?: WebSearchMode; };`;
    if (kind === "truncated")
      f.completedData(4).value = f.source + "x".repeat(4000);
    if (kind === "redacted") f.completedData(4).value = `${f.source}[redacted]`;
    expect(f.read().primarySourceRetrieved).toBe(false);
  });
  it.each([
    "failed",
    "unknown-provider",
    "wrong-query",
    "missing-provider",
    "empty",
    "missing-value",
    "redacted",
    "depth-loss",
    "journal-truncated",
    "over-cap",
  ])("does not certify %s search", (kind) => {
    const f = fixture();
    if (kind === "failed") f.events[2].metadata.status = "failed";
    if (kind === "unknown-provider")
      f.completedData(2).provider = "PRIVATE_PROVIDER_CANARY";
    if (kind === "wrong-query")
      f.completedData(2).query = "PRIVATE_QUERY_CANARY";
    if (kind === "missing-provider") delete f.completedData(2).provider;
    if (kind === "empty") f.completedData(2).value = "   ";
    if (kind === "missing-value") delete f.completedData(2).value;
    if (kind === "redacted") f.completedData(2).value = "[redacted]";
    if (kind === "depth-loss") f.completedData(2).value = "[max-depth]";
    if (kind === "journal-truncated")
      f.completedData(2).value = "...[truncated 2 chars]";
    if (kind === "over-cap") f.completedData(2).value = "x".repeat(4001);
    const output = f.read();
    expect(output.searchReturnedData).toBe(false);
    expect(output.searchOutputAtCap).toBe(false);
    expect(output.status).not.toBe("verified");
    expect(JSON.stringify(output)).not.toContain("CANARY");
  });
  it.each([
    "SHELL",
    "WRITE_FILE",
    "TASKS_SPAWN_AGENT",
    "DOOLITTLE_BROWSER_ANALYZE",
    "PRIVATE_ACTION_CANARY",
  ])("rejects prohibited original %s actions", (action) => {
    const f = fixture();
    f.events.splice(4, 0, { ...f.events[3], metadata: { action } });
    const output = f.read();
    expect(output.reason).toBe("action-policy");
    expect(output.executionIntegrity).toBe(false);
    expect(JSON.stringify(output)).not.toContain(action);
  });
  it.each([
    "missing-anchor",
    "foreign-session",
    "foreign-room",
    "foreign-run",
    "foreign-source",
    "before-start",
    "after-result",
    "wrong-order",
    "duplicate-fetch",
    "contradictory-action",
  ])("rejects %s original chronology", (kind) => {
    const f = fixture();
    if (kind === "missing-anchor") f.events.shift();
    if (kind === "foreign-session") f.events[2].sessionId = "foreign";
    if (kind === "foreign-room") f.events[2].roomId = "foreign";
    if (kind === "foreign-run") f.events[2].runId = "foreign";
    if (kind === "foreign-source") f.events[2].source = "desktop";
    if (kind === "before-start") f.events[0].createdAt = "2026-10-02T00:00:00Z";
    if (kind === "after-result") f.events[5].createdAt = "2026-10-03T00:00:09Z";
    if (kind === "wrong-order")
      [f.events[2], f.events[3]] = [f.events[3], f.events[2]];
    if (kind === "duplicate-fetch") f.events.splice(5, 0, f.events[4]);
    if (kind === "contradictory-action")
      f.completedData(4).actionName = "SHELL";
    expect(f.read().status).not.toBe("verified");
  });
  it("links/assertions and replayed model.response actionResults never substitute for original completions", () => {
    const f = fixture();
    f.events[5].metadata.actionResults = [
      f.events[2].metadata.actionResult,
      f.events[4].metadata.actionResult,
    ];
    f.events.splice(1, 4);
    expect(f.read().searchReturnedData).toBe(false);
  });
  it.each([
    "later-contradiction",
    "later-unfinished-request",
    "orphan-response",
    "duplicate-matching-pair",
    "overlapping-request",
  ])("rejects %s after an otherwise matching original final answer", (kind) => {
    const f = fixture();
    const request = { ...f.events[0], createdAt: f.events[5].createdAt };
    const response = {
      ...f.events[5],
      metadata: {
        ...f.events[5].metadata,
        response:
          kind === "duplicate-matching-pair"
            ? f.response
            : "CONTRADICTION_CANARY",
      },
    };
    if (kind === "later-unfinished-request") f.events.push(request);
    else if (kind === "orphan-response") f.events.push(response);
    else if (kind === "overlapping-request") f.events.splice(5, 0, request);
    else f.events.push(request, response);
    const output = f.read();
    expect(output.reason).toBe("execution-unconfirmed");
    expect(output.executionIntegrity).toBe(false);
    expect(output.status).not.toBe("verified");
    expect(JSON.stringify(output)).not.toContain("CONTRADICTION_CANARY");
  });
  it("admits completed sequential original requests only when the final response matches CLI", () => {
    const f = fixture();
    const finalResponse = { ...f.events[5] };
    f.events[5] = {
      ...f.events[5],
      metadata: { ...f.events[5].metadata, response: "interim" },
    };
    f.events.push(
      { ...f.events[0], createdAt: f.events[5].createdAt },
      finalResponse,
    );
    expect(f.read().status).toBe("verified");
  });
  it.each([
    "no-start",
    "wrong-session",
    "duplicate-start",
    "cancelled",
    "error",
    "wrong-final-text",
  ])("requires actual CLI %s boundary", (kind) => {
    const f = fixture();
    if (kind === "no-start") f.stdout.shift();
    if (kind === "wrong-session") f.stdout[0].sessionId = "foreign";
    if (kind === "duplicate-start") f.stdout.unshift(f.stdout[0]);
    if (kind === "cancelled") f.stdout[2].status = "cancelled";
    if (kind === "error")
      f.stdout.push({
        type: "error",
        timestamp: "2026-10-03T00:00:07Z",
        message: "ERROR_CANARY",
      } as unknown as (typeof f.stdout)[0]);
    if (kind === "wrong-final-text") f.stdout[1].text = "links only";
    expect(f.read().status).toBe("unavailable");
  });
  it("requires cleanup/normal execution before reading even a valid journal", () => {
    const f = fixture();
    expect(f.read({ executionConfirmed: false }).reason).toBe(
      "execution-unconfirmed",
    );
  });
  it.each(["missing", "malformed", "events", "bytes", "invalid-utf8"])(
    "fails closed for %s journal",
    (kind) => {
      const f = fixture();
      f.write();
      if (kind === "missing") rmSync(f.path);
      if (kind === "malformed") writeFileSync(f.path, "{CANARY\n");
      if (kind === "events")
        writeFileSync(f.path, "{}\n".repeat(RESEARCH_JOURNAL_EVENT_LIMIT + 1));
      if (kind === "bytes")
        writeFileSync(f.path, "x".repeat(RESEARCH_JOURNAL_BYTE_LIMIT + 1));
      if (kind === "invalid-utf8") writeFileSync(f.path, Buffer.from([255]));
      const output = readResearchGrounding({
        root: f.root,
        stdout: f.stdout.map((event) => JSON.stringify(event)).join("\n"),
        response: f.response,
        executionConfirmed: true,
      });
      expect(output.status).toBe("unavailable");
      expect(output.reason).toBe(
        kind === "missing"
          ? "missing-input"
          : kind === "events" || kind === "bytes"
            ? "truncated-input"
            : "invalid-input",
      );
    },
  );
  it.each(["task", "data", "trajectories", "leaf"] as const)(
    "refuses %s symlink without adopting foreign sentinel",
    (boundary) => {
      const f = fixture();
      f.write();
      const target = {
        task: f.task,
        data: f.data,
        trajectories: f.trajectories,
        leaf: f.path,
      }[boundary];
      const moved = `${target}.original`;
      renameSync(target, moved);
      if (boundary === "task") roots.push(moved);
      const foreign = temporary();
      const sentinel =
        boundary === "leaf" ? join(foreign, "sentinel") : foreign;
      if (boundary === "leaf") writeFileSync(sentinel, "FOREIGN_SENTINEL");
      else writeFileSync(join(foreign, "sentinel"), "FOREIGN_SENTINEL");
      symlinkSync(sentinel, target);
      expect(
        readResearchGrounding({
          root: f.root,
          stdout: "",
          response: f.response,
          executionConfirmed: true,
        }).reason,
      ).toBe("unsafe-input");
      expect(
        readFileSync(
          boundary === "leaf" ? sentinel : join(foreign, "sentinel"),
          "utf8",
        ),
      ).toBe("FOREIGN_SENTINEL");
    },
  );
  it("rejects an ordinary replacement data directory", () => {
    const f = fixture();
    renameSync(f.data, `${f.data}.original`);
    mkdirSync(f.data, { mode: 0o700 });
    writeFileSync(join(f.data, "sentinel"), "CANARY");
    expect(
      readResearchGrounding({
        root: f.root,
        stdout: "",
        response: f.response,
        executionConfirmed: true,
      }).reason,
    ).toBe("unsafe-input");
    expect(existsSync(join(f.data, "sentinel"))).toBe(true);
  });
  it.each(["hardlink", "writable"])("rejects %s leaf admission", (kind) => {
    const f = fixture();
    f.write();
    if (kind === "hardlink") linkSync(f.path, join(f.data, "alias"));
    else chmodSync(f.path, 0o666);
    expect(
      readResearchGrounding({
        root: f.root,
        stdout: "",
        response: f.response,
        executionConfirmed: true,
      }).reason,
    ).toBe("unsafe-input");
  });
});
