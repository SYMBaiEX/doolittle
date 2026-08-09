import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findMismatchedWorkflowNubVersions,
  findMutableWorkflowActions,
  isImmutableWorkflowAction,
} from "./check-workflow-security";
import { listGitTrackedFiles } from "./git-tracked-files";

describe("workflow action security", () => {
  it("accepts local actions, commit-pinned actions, and digest-pinned images", () => {
    expect(isImmutableWorkflowAction("./.github/actions/setup")).toBe(true);
    expect(
      isImmutableWorkflowAction(
        "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      ),
    ).toBe(true);
    expect(
      isImmutableWorkflowAction(`docker://alpine@sha256:${"a".repeat(64)}`),
    ).toBe(true);
  });

  it("reports mutable tags, branches, and container tags with line numbers", () => {
    const failures = findMutableWorkflowActions(
      [
        "steps:",
        "  - uses: actions/checkout@v4",
        '  - uses: "owner/action@main"',
        "  - uses: docker://alpine:latest",
      ].join("\n"),
      ".github/workflows/example.yml",
    );

    expect(failures).toEqual([
      {
        file: ".github/workflows/example.yml",
        line: 2,
        reference: "actions/checkout@v4",
      },
      {
        file: ".github/workflows/example.yml",
        line: 3,
        reference: "owner/action@main",
      },
      {
        file: ".github/workflows/example.yml",
        line: 4,
        reference: "docker://alpine:latest",
      },
    ]);
  });

  it("keeps every tracked workflow on immutable action references", () => {
    const failures = listGitTrackedFiles()
      .filter((file) => /^\.github\/workflows\/.+\.ya?ml$/u.test(file))
      .flatMap((file) =>
        findMutableWorkflowActions(readFileSync(file, "utf8"), file),
      );

    expect(failures).toEqual([]);
  });

  it("requires setup-nub actions to use the repository toolchain version", () => {
    const source = [
      "steps:",
      "  - name: Current",
      "    uses: nubjs/setup-nub@47e5e7393d50f4e9544ddaf756aa277972afba2d",
      "    with:",
      "      nub-version: 0.7.4",
      "  - name: Stale",
      "    uses: nubjs/setup-nub@47e5e7393d50f4e9544ddaf756aa277972afba2d",
      "    with:",
      "      nub-version: 0.6.0",
      "  - name: Missing",
      "    uses: nubjs/setup-nub@47e5e7393d50f4e9544ddaf756aa277972afba2d",
    ].join("\n");

    expect(
      findMismatchedWorkflowNubVersions(
        source,
        ".github/workflows/example.yml",
        "0.7.4",
      ),
    ).toEqual([
      {
        file: ".github/workflows/example.yml",
        line: 9,
        expected: "0.7.4",
        actual: "0.6.0",
      },
      {
        file: ".github/workflows/example.yml",
        line: 11,
        expected: "0.7.4",
        actual: "<missing>",
      },
    ]);
  });
});
