import { expect, it } from "vitest";
import { hasExplicitWorkspaceMutationIntent } from "../../packages/agent/src/runtime/workspace-mutation-intent";

it.each([
  'The file says "write App.tsx".',
  'The file says "write \\"App.tsx\\" now".',
  "The file says ‘write App.tsx’.",
  "The file says “write App.tsx”.",
  "The file says 'write App.tsx'.",
  "The file says `write App.tsx`.",
  "The file says ```\nwrite App.tsx\n```.",
  'The file says "write App.tsx',
  "The file says `write App.tsx",
])("does not treat quoted examples as authorization: %s", (message) => {
  expect(hasExplicitWorkspaceMutationIntent(message)).toBe(false);
});

it("preserves direct commands, contractions and instructions after examples", () => {
  expect(hasExplicitWorkspaceMutationIntent('Edit "App.tsx".')).toBe(true);
  expect(hasExplicitWorkspaceMutationIntent("Don't edit App.tsx.")).toBe(false);
  expect(
    hasExplicitWorkspaceMutationIntent(
      'The file says "do not edit". Then update App.tsx.',
    ),
  ).toBe(true);
  expect(hasExplicitWorkspaceMutationIntent("`example\nUpdate App.tsx.")).toBe(
    true,
  );
});

it("handles long escaped and unterminated quotes without regex backtracking", () => {
  for (const quotation of [
    '"' + '\\"'.repeat(20_000),
    "“".repeat(40_000),
    "‘".repeat(40_000),
  ]) {
    expect(
      hasExplicitWorkspaceMutationIntent(
        `The file says ${quotation}write App.tsx`,
      ),
    ).toBe(false);
  }
}, 2_000);
