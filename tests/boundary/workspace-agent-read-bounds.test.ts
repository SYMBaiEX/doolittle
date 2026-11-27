import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HandlerOptions, IAgentRuntime, Memory } from "@elizaos/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFileActions } from "../../packages/agent/src/actions/file-action";
import {
  type AcpHostDependencies,
  createAcpProtocolHost,
} from "../../packages/agent/src/services/acp/host";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";
import { MAX_EDITABLE_FILE_BYTES } from "../../packages/agent/src/services/workspace-service/file-operations";

const LINE_COUNT = 70_000;
const DEEP_LINE = 65_000;

let root: string;
let workspace: WorkspaceService;

function largeLogContent(): string {
  return Array.from(
    { length: LINE_COUNT },
    (_, index) => `${String(index + 1).padStart(5, "0")}:xxxxxxxxxx`,
  ).join("\n");
}

function writeLargeLog(): void {
  writeFileSync(join(root, "huge.log"), largeLogContent());
}

async function runReadAction(parameters: HandlerOptions["parameters"]) {
  const runtime = {
    getService: () => workspace,
  } as unknown as IAgentRuntime;
  const action = createFileActions().find(
    (candidate) => candidate.name === "READ_FILE",
  );
  if (!action) throw new Error("Missing READ_FILE action.");
  return action.handler(runtime, { content: {} } as Memory, undefined, {
    parameters,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doolittle-agent-read-bounds-"));
  workspace = new WorkspaceService(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it("returns bounded line reads with truncation metadata instead of scanning the whole file", () => {
  writeLargeLog();
  const result = workspace.readLines("huge.log", { offset: 1, limit: 5 });

  expect(result.lines).toHaveLength(5);
  expect(result.truncated).toBe(true);
  expect(result.limitBytes).toBe(MAX_EDITABLE_FILE_BYTES);
  expect(result.readBytes).toBeLessThanOrEqual(MAX_EDITABLE_FILE_BYTES);
  expect(result.sizeBytes).toBeGreaterThan(MAX_EDITABLE_FILE_BYTES);
});

it("discloses bounded reads in READ_FILE output", async () => {
  writeLargeLog();
  const result = await runReadAction({ path: "huge.log", limit: 5 });

  expect(result?.success).toBe(true);
  expect(result?.text).toContain("Lines: 1-5");
  expect(result?.text).toContain("Read truncated");
});

it("discloses truncation to ACP readers, including requested lines beyond the bounded prefix", async () => {
  writeLargeLog();
  const host = createAcpProtocolHost({
    workspace,
    actorId: async () => "actor",
    executeTurn: async () => "",
  } as unknown as AcpHostDependencies);
  const path = join(root, "huge.log");

  try {
    const wholeFile = host.readWorkspace(path);
    expect(wholeFile).toContain("Doolittle truncated this workspace read");

    const deepSlice = host.readWorkspace(path, {
      sessionId: "session",
      path,
      line: DEEP_LINE,
      limit: 3,
    });
    expect(deepSlice).toContain("Doolittle truncated this workspace read");
    expect(deepSlice).not.toContain(`${DEEP_LINE}:xxxxxxxxxx`);
  } finally {
    await host.dispose();
  }
});
