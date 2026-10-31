import { expect, it } from "vitest";
import { inspectWorkspaceCommands } from "../../packages/agent/src/utils/workspace-commands";

const root = "/workspace/doolittle";
it("recognizes the monorepo's actual Nub build and verification commands", () => {
  expect(
    inspectWorkspaceCommands(
      "nub run typecheck && nub run check:release",
      root,
    ),
  ).toEqual([
    {
      runner: "nub",
      kind: "verification",
      directory: root,
      order: 0,
      script: "typecheck",
    },
    {
      runner: "nub",
      kind: "verification",
      directory: root,
      order: 1,
      script: "check:release",
    },
  ]);
  expect(
    inspectWorkspaceCommands("nub --cwd apps/desktop run build", root)[0],
  ).toMatchObject({
    runner: "nub",
    kind: "build",
    directory: `${root}/apps/desktop`,
  });
});
it("retains scoped test identity instead of claiming that every test ran", () => {
  const command = "nub run test:scope tests/boundary/project-access.test.ts";
  expect(inspectWorkspaceCommands(command, root)[0]).toMatchObject({
    runner: "nub",
    kind: "verification",
    script: "test:scope tests/boundary/project-access.test.ts",
  });
});
it.each([
  "nub run test --help",
  "nub run check:release || true",
  "echo 'nub run check:release'",
  "nub run test:scope ../outside.test.ts",
  "nub run test:scope tests/a.test.ts --help",
  "nub run check:release > result.txt",
  "nub run check:release; true",
])("refuses unsupported or misleading proof: %s", (command) => {
  expect(inspectWorkspaceCommands(command, root)).toEqual([]);
});
