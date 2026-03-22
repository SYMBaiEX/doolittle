import { expect, it } from "bun:test";
import {
  buildAcpBundlePayload,
  buildAcpEditorSummary,
  buildAcpPackageMetadata,
  buildAcpRegistryEntry,
  guessAcpToolKind,
} from "./index";

it("builds ACP metadata, registry, editor, and bundle payloads", () => {
  const pkg = buildAcpPackageMetadata({
    name: "eliza-agent",
    version: "1.2.3",
    description: "Example",
    packageManager: "bun@1.3.11",
    workspaceCount: 4,
    pluginPackageCount: 2,
    rootPath: "/repo",
  });
  const registry = buildAcpRegistryEntry({
    agentName: "Eliza Agent",
    description: "Eliza Agent runtime",
    package: pkg,
    command: "bun run start --cli",
    toolCount: 7,
  });
  const editor = buildAcpEditorSummary({
    package: pkg,
    registryPath: "/tmp/agent.json",
    exportDir: "/tmp/exports",
    importDir: "/tmp/imports",
    commandConfigured: true,
    command: "bun run start --cli",
  });
  const bundle = buildAcpBundlePayload({
    exportedAt: "2026-03-21T00:00:00.000Z",
    label: "latest",
    package: pkg,
    status: { ok: true },
    editor,
    registry,
    sessions: { totalSessions: 3 },
    tools: [
      {
        name: "workspace.read",
        description: "Read workspace files",
        kind: guessAcpToolKind({ id: "workspace.read" }),
        source: "eliza-agent",
      },
    ],
  });

  expect(pkg.workspaceCount).toBe(4);
  expect(registry.capabilities.tools).toBe(7);
  expect(editor.installCommand).toContain("bun install");
  expect(bundle.tools.length).toBe(1);
});
