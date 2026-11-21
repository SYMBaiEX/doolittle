import { Buffer } from "node:buffer";
import {
  link,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { runWithConversationWorkspace } from "../../packages/agent/src/runtime/workspace-scope";
import { handleWorkspaceRoutes } from "../../packages/agent/src/server/routes/workspace";
import {
  runTextProcess,
  textProcessCapabilities,
} from "../../packages/agent/src/services/process-execution";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";
import { searchWorkspace } from "../../packages/agent/src/services/workspace-service/search";

vi.mock(import("../../packages/agent/src/services/process-execution"), () => ({
  runTextProcess: vi.fn(),
  textProcessCapabilities: vi.fn(),
}));

let fixture: string;
let workspace: string;

beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "doolittle-workspace-search-"));
  workspace = join(fixture, "workspace");
  await mkdir(join(workspace, "src"), { recursive: true });
  vi.resetAllMocks();
  vi.mocked(textProcessCapabilities).mockReturnValue({
    ownedCancellation: true,
  });
});

afterEach(async () => {
  await rm(fixture, { recursive: true, force: true });
});

it("returns only ordered, verified matches within a requested file or directory", async () => {
  const alphaName =
    process.platform === "win32" ? "alpha-part.txt" : "alpha:part.txt";
  const alphaPath = `src/${alphaName}`;
  await Promise.all([
    writeFile(join(workspace, "outside-scope.txt"), "-éclair\n"),
    writeFile(join(workspace, "src", ".env"), "-éclair credential\n"),
    writeFile(
      join(workspace, "src", alphaName),
      "-éclair a\r\n-éclair b\n-éclair c\n-éclair d",
    ),
    writeFile(
      join(workspace, "src", "beta.txt"),
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("-éclair unicode\r\n", "utf16le"),
      ]),
    ),
  ]);
  const candidates = [
    "src/beta.txt",
    "outside-scope.txt",
    "src/.env",
    alphaPath,
    "src/missing.txt",
  ].join("\0");
  vi.mocked(runTextProcess).mockResolvedValue({
    exitCode: 0,
    stdout: candidates,
    stderr: "",
    durationMs: 1,
    sandbox: "none",
  });
  const signal = new AbortController().signal;
  await expect(
    searchWorkspace(workspace, "-éclair", 2, { signal, path: "src" }),
  ).resolves.toEqual([
    {
      path: alphaPath,
      matches: ["-éclair a", "-éclair b", "-éclair c"],
    },
    { path: "src/beta.txt", matches: ["-éclair unicode"] },
  ]);
  expect(runTextProcess).toHaveBeenCalledWith(
    "rg",
    expect.arrayContaining([
      "--files-with-matches",
      "-e",
      "-éclair",
      alphaPath,
    ]),
    expect.objectContaining({
      abortSignal: signal,
      requireOwnedCancellation: true,
    }),
  );
  expect(vi.mocked(runTextProcess).mock.calls[0]?.[1]).not.toContain(
    "src/.env",
  );

  await expect(
    searchWorkspace(workspace, "-éclair", 2, { path: "src/beta.txt", signal }),
  ).resolves.toEqual([{ path: "src/beta.txt", matches: ["-éclair unicode"] }]);
  await expect(
    searchWorkspace(workspace, "-éclair", 2, { path: "..", signal }),
  ).rejects.toThrow("inside the configured workspace");
});

it.skipIf(process.platform === "win32")(
  "drops files replaced by a link after ripgrep candidate enumeration",
  async () => {
    const external = join(fixture, "external.txt");
    const file = join(workspace, "src", "candidate.txt");
    await Promise.all([
      writeFile(file, "fixture local"),
      writeFile(external, "fixture outside"),
    ]);
    vi.mocked(runTextProcess).mockImplementationOnce(async () => {
      await rm(file);
      await symlink(external, file, "file");
      return {
        exitCode: 0,
        stdout: "src/candidate.txt\0",
        stderr: "",
        durationMs: 1,
        sandbox: "none",
      };
    });

    await expect(searchWorkspace(workspace, "fixture")).resolves.toEqual([]);
  },
);

it("uses ordered, case-insensitive file reads when the router cannot cancel rg", async () => {
  vi.mocked(textProcessCapabilities).mockReturnValue({
    ownedCancellation: false,
  });
  await Promise.all([
    writeFile(join(workspace, "src", "a.txt"), "ÉCLAIR first\n"),
    writeFile(join(workspace, "src", "b.txt"), "éclair second\n"),
    writeFile(join(workspace, "src", "secret.pem"), "ÉCLAIR ignored\n"),
  ]);
  const signal = new AbortController().signal;
  await expect(
    searchWorkspace(workspace, "éclair", 1, { signal }),
  ).resolves.toEqual([{ path: "src/a.txt", matches: ["ÉCLAIR first"] }]);
  expect(runTextProcess).not.toHaveBeenCalled();
});

it("bounds excerpts around a match and enforces the optional single-link rule", async () => {
  vi.mocked(textProcessCapabilities).mockReturnValue({
    ownedCancellation: false,
  });
  const external = join(fixture, "external.txt");
  await writeFile(external, "needle external");
  await Promise.all([
    link(external, join(workspace, "src", "alias.txt")),
    writeFile(
      join(workspace, "src", "source.txt"),
      `${"a".repeat(500)}needle${"b".repeat(500)}`,
    ),
  ]);
  const results = await searchWorkspace(workspace, "needle", 3, {
    signal: new AbortController().signal,
    maxMatchChars: 40,
    singleLink: true,
  });
  expect(results).toEqual([
    { path: "src/source.txt", matches: [expect.stringContaining("needle")] },
  ]);
  expect(results[0]?.matches[0]).toHaveLength(40);
});

it("finds a bounded excerpt in a file larger than the concurrent read limit", async () => {
  vi.mocked(textProcessCapabilities).mockReturnValue({
    ownedCancellation: false,
  });
  const marker = "markerNearTheEnd";
  const bytes = Buffer.alloc(17 * 1024 * 1024, "x");
  bytes.write(marker, bytes.length - marker.length);
  await writeFile(join(workspace, "src", "large.txt"), bytes);
  const results = await searchWorkspace(workspace, marker, 1, {
    signal: new AbortController().signal,
    maxMatchChars: 80,
  });
  expect(results).toEqual([
    {
      path: "src/large.txt",
      matches: [expect.stringMatching(/markerNearTheEnd$/u)],
    },
  ]);
  expect(results[0]?.matches[0]).toHaveLength(80);
});

it("rejects a conversation workspace rebound to a different root", async () => {
  const approvedRoot = await realpath(workspace);
  const substitute = join(fixture, "substitute");
  await mkdir(substitute);
  await rename(workspace, join(fixture, "moved-workspace"));
  await symlink(
    substitute,
    workspace,
    process.platform === "win32" ? "junction" : "dir",
  );
  const service = new WorkspaceService(substitute);
  await expect(
    runWithConversationWorkspace(
      {
        sessionId: "test-conversation",
        botId: "test-bot",
        workspacePath: approvedRoot,
      },
      () => service.search("contents"),
    ),
  ).rejects.toThrow("original root");
  expect(runTextProcess).not.toHaveBeenCalled();
});

it("cancels an active workspace search at the HTTP request boundary", async () => {
  await writeFile(join(workspace, "src", "candidate.txt"), "fixture");
  vi.mocked(runTextProcess).mockImplementationOnce(
    (_command, _args, { abortSignal }) =>
      new Promise((_resolve, reject) => {
        abortSignal?.addEventListener(
          "abort",
          () => reject(abortSignal.reason),
          {
            once: true,
          },
        );
      }),
  );
  const search = vi.fn((query, limit, options) =>
    searchWorkspace(workspace, query, limit, options),
  );
  const context = {
    services: { workspace: { search } },
  } as unknown as AppContext;
  const controller = new AbortController();
  const request = new Request(
    "http://localhost/workspace/search?query=fixture",
    {
      signal: controller.signal,
    },
  );
  const response = handleWorkspaceRoutes(
    context,
    request,
    new URL(request.url),
  );
  const completion = expect(response).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(runTextProcess).toHaveBeenCalledTimes(1));
  controller.abort();
  await completion;
  expect(search).toHaveBeenCalledExactlyOnceWith("fixture", undefined, {
    signal: request.signal,
  });
  expect(runTextProcess).toHaveBeenCalledTimes(1);
});
