import { describe, expect, it } from "vitest";
import { inspectWorkspaceCommands } from "./workspace-commands";

describe("literal workspace command receipts", () => {
  it.each([
    'bun --cwd "/workspace/my blog" run build',
    'bun run --cwd "/workspace/my blog" build',
    'bun --cwd="/workspace/my blog" run --bun build',
    'cd -- "/workspace" && bun run --cwd "my blog" build',
  ])("recognizes a scoped Bun build: %s", (command) => {
    expect(inspectWorkspaceCommands(command, "/elsewhere")).toContainEqual(
      expect.objectContaining({
        runner: "bun",
        kind: "build",
        directory: "/workspace/my blog",
      }),
    );
  });

  it("keeps per-invocation cwd and operation order separate", () => {
    expect(
      inspectWorkspaceCommands(
        "cd /workspace && bun install --cwd blog --frozen-lockfile && bun --cwd other run build",
      ),
    ).toMatchObject([
      { kind: "install", directory: "/workspace/blog", order: 1 },
      { kind: "build", directory: "/workspace/other", order: 2 },
    ]);
    expect(
      inspectWorkspaceCommands(
        "bun --cwd /workspace/blog install && bun run build",
        "/workspace",
      ),
    ).toMatchObject([
      { directory: "/workspace/blog" },
      { directory: "/workspace" },
    ]);
  });

  it.each([
    'echo "bun run build"',
    "false && bun run build || true",
    "bun run build; true",
    "bun run build | cat",
    "bun run build > /tmp/build.log",
    "bun run build &",
    "bun install --dry-run",
    "bun run --if-present build",
    "bun run build --help",
    "bun run build --cwd /workspace/blog",
    "bun run --filter blog build",
    'bun run --cwd "$WORKSPACE" build',
    "bun --cwd $(pwd) run build",
    "bun run build # not proven",
    "bun run build\nbun install",
    'bun run build "',
    "bun run build \\",
    "bun --cwd /one --cwd /two run build",
  ])(
    "does not turn ambiguous shell text into success evidence: %s",
    (command) => {
      expect(inspectWorkspaceCommands(command, "/workspace/blog")).toEqual([]);
    },
  );

  it("leaves missing cwd unavailable and distinguishes the bundler from a package build", () => {
    expect(inspectWorkspaceCommands("bun run build")).toMatchObject([
      { kind: "build", directory: undefined },
    ]);
    expect(inspectWorkspaceCommands("bun build")).toMatchObject([
      { kind: "bundle" },
    ]);
  });
});
