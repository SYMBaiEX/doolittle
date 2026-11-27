import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const root = process.cwd();
const uiStyles = readFileSync(join(root, "packages/ui/src/styles.css"), "utf8");
const routeDocuments = readFileSync(
  join(root, "apps/desktop/src/renderer/app-shell/route-documents.css"),
  "utf8",
);
const workbench = readFileSync(
  join(root, "apps/desktop/src/renderer/components/workbench/workbench.css"),
  "utf8",
);
const viewLayout = readFileSync(
  join(root, "apps/desktop/src/renderer/app-shell/view-layout.ts"),
  "utf8",
);

it("defines exactly two semantic focus recipes in the shared UI stylesheet", () => {
  expect(uiStyles).toContain("--focus-quiet: 1px solid var(--text-soft);");
  expect(uiStyles).toContain("--focus-quiet-offset: -1px;");
  expect(uiStyles).toContain("--focus-command: 2px solid var(--focus-ring);");
  expect(uiStyles).toContain("--focus-command-offset: 2px;");
  expect(uiStyles).toContain("outline: var(--focus-quiet);");
  expect(uiStyles).toContain("outline: var(--focus-command);");
});

it("uses the shared recipes instead of route-local focus ring dialects", () => {
  expect(routeDocuments).toContain("outline: var(--focus-quiet);");
  expect(routeDocuments).toContain(
    "outline-offset: var(--focus-quiet-offset);",
  );
  expect(routeDocuments).not.toContain("outline: 1px solid var(--focus-ring);");

  expect(workbench).toContain("outline: var(--focus-command);");
  expect(workbench).toContain("outline-offset: var(--focus-command-offset);");
  expect(workbench).not.toContain("outline: 1px solid var(--focus-ring);");

  expect(viewLayout).toContain("[outline:var(--focus-command)]");
  expect(viewLayout).toContain("[outline-offset:var(--focus-command-offset)]");
});
