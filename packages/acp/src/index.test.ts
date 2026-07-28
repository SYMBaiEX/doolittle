import { expect, it } from "vitest";
import {
  buildAcpBundlePayload,
  buildAcpEditorSummary,
  buildAcpPackageMetadata,
  buildAcpRegistryEntry,
  guessAcpToolKind,
} from "./index";

it("builds ACP metadata, registry, editor, and bundle payloads", () => {
  const pkg = buildAcpPackageMetadata({
    name: "doolittle",
    version: "1.2.3",
    description: "Example",
    packageManager: "nub@0.6.0",
    workspaceCount: 4,
    pluginPackageCount: 2,
    rootPath: "/repo",
  });
  const registry = buildAcpRegistryEntry({
    agentName: "Doolittle",
    description: "Doolittle runtime",
    package: pkg,
    command: "nub run start",
    toolCount: 7,
  });
  const editor = buildAcpEditorSummary({
    package: pkg,
    registryPath: "/tmp/agent.json",
    exportDir: "/tmp/exports",
    importDir: "/tmp/imports",
    commandConfigured: true,
    command: "nub run start",
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
        source: "doolittle",
      },
    ],
  });

  expect(pkg.workspaceCount).toBe(4);
  expect(registry.capabilities.tools).toBe(7);
  expect(editor.installCommand).toContain("nub install");
  expect(bundle.tools.length).toBe(1);
});
