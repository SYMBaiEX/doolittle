import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findMismatchedWorkflowNubVersions,
  findMutableWorkflowActions,
  findPersistedCheckoutCredentials,
  isImmutableWorkflowAction,
} from "./check-workflow-security";
import { listGitTrackedFiles } from "./git-tracked-files";

describe("workflow action security", () => {
  it.each([
    { input: undefined, rejected: true },
    { input: "true", rejected: true },
    { input: "false", rejected: false },
    { input: '"false"', rejected: false },
  ])(
    "requires explicit disabled checkout credentials: $input",
    ({ input, rejected }) => {
      const source = [
        "steps:",
        "  - name: Checkout",
        "    uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        ...(input ? ["    with:", `      persist-credentials: ${input}`] : []),
        "  - name: Later step cannot satisfy the checkout input",
        "    with:",
        "      persist-credentials: false",
      ].join("\n");
      expect(findPersistedCheckoutCredentials(source, "ci.yml")).toEqual(
        rejected
          ? [
              {
                file: "ci.yml",
                line: 3,
                reference:
                  "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
              },
            ]
          : [],
      );
    },
  );

  it("keeps checked-out PR code free of persisted Git credentials", () => {
    const file = ".github/workflows/ci.yml";
    expect(
      findPersistedCheckoutCredentials(readFileSync(file, "utf8"), file),
    ).toEqual([]);
  });

  it.each([
    ["    env:", "      persist-credentials: false"],
    [
      "    with:",
      "      sparse-checkout: |",
      "        persist-credentials: false",
    ],
    [
      "    with:",
      "      fetch-depth: 1",
      "    env:",
      "      persist-credentials: false",
    ],
    [
      "    with:",
      '      sparse-checkout: "',
      "        persist-credentials: false",
      '        "',
    ],
  ])(
    "rejects a false value outside direct checkout inputs: %j",
    (...nested) => {
      const source = [
        "steps:",
        "  - name: Checkout",
        "    uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        ...nested,
      ].join("\n");
      expect(findPersistedCheckoutCredentials(source, "ci.yml")).toHaveLength(
        1,
      );
    },
  );

  it("checks aliased checkout actions and input maps", () => {
    for (const persistence of ["false", "true"]) {
      const source = [
        "steps:",
        "  - uses: &checkout actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        "    with: &inputs",
        `      persist-credentials: ${persistence}`,
        "  - uses: *checkout",
        "    with: *inputs",
      ].join("\n");
      expect(findPersistedCheckoutCredentials(source, "ci.yml")).toHaveLength(
        persistence === "false" ? 0 : 2,
      );
    }
  });

  it("ignores checkout-shaped matrix data outside real steps", () => {
    const source = [
      "jobs:",
      "  validate:",
      "    strategy:",
      "      matrix:",
      "        include:",
      "          - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "    steps:",
      "      - run: echo checked",
    ].join("\n");
    expect(findPersistedCheckoutCredentials(source, "ci.yml")).toEqual([]);
  });

  it("rejects a whole checkout step aliased from matrix data", () => {
    const source = [
      "jobs:",
      "  validate:",
      "    strategy:",
      "      matrix:",
      "        include:",
      "          - &checkout",
      "            uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "    steps:",
      "      - *checkout",
    ].join("\n");
    expect(findPersistedCheckoutCredentials(source, "ci.yml")).toEqual([
      {
        file: "ci.yml",
        line: 9,
        reference: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      },
    ]);
  });

  it("fails closed on malformed workflow YAML", () => {
    expect(() =>
      findPersistedCheckoutCredentials("steps: [", "ci.yml"),
    ).toThrow("Workflow YAML could not be parsed");
  });

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
      "      nub-version: 0.9.5",
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
        "0.9.5",
      ),
    ).toEqual([
      {
        file: ".github/workflows/example.yml",
        line: 9,
        expected: "0.9.5",
        actual: "0.6.0",
      },
      {
        file: ".github/workflows/example.yml",
        line: 11,
        expected: "0.9.5",
        actual: "<missing>",
      },
    ]);
  });
});
