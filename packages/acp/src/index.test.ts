import { expect, it } from "vitest";
import {
  buildAcpBundlePayload,
  buildAcpEditorSummary,
  buildAcpPackageMetadata,
  buildAcpRegistryEntry,
  client,
  createDoolittleAcpAgent,
  guessAcpToolKind,
  methods,
  PROTOCOL_VERSION,
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
  expect(registry.distribution).toEqual({
    type: "command",
    command: "/bin/zsh",
    args: ["-lc", "nub run start"],
  });
  expect(
    buildAcpRegistryEntry({
      agentName: "Doolittle",
      description: "Doolittle runtime",
      package: pkg,
      toolCount: 7,
    }).distribution,
  ).toEqual({
    type: "command",
    command: "doolittle",
    args: ["acp"],
  });
  expect(editor.installCommand).toContain("nub install");
  expect(bundle.tools.length).toBe(1);
});

it("serves the stable lifecycle through official SDK apps", async () => {
  const sessions = new Set<string>();
  const agentApp = createDoolittleAcpAgent({
    initialize: () => ({
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: true },
    }),
    newSession: () => {
      sessions.add("session-1");
      return { sessionId: "session-1" };
    },
    loadSession: () => ({}),
    async prompt(params, context) {
      await context.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        },
      });
      return { stopReason: "end_turn" };
    },
    cancel: () => undefined,
  });
  const updates: string[] = [];
  const clientApp = client({ name: "test-client" }).onNotification(
    methods.client.session.update,
    ({ params }) => {
      if (
        params.update.sessionUpdate === "agent_message_chunk" &&
        params.update.content.type === "text"
      ) {
        updates.push(params.update.content.text);
      }
    },
  );
  const connection = clientApp.connect(agentApp);

  const initialized = await connection.agent.request(methods.agent.initialize, {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  const session = await connection.agent.request(methods.agent.session.new, {
    cwd: "/repo",
    mcpServers: [],
  });
  const prompt = await connection.agent.request(methods.agent.session.prompt, {
    sessionId: session.sessionId,
    prompt: [{ type: "text", text: "hi" }],
  });

  expect(initialized.protocolVersion).toBe(PROTOCOL_VERSION);
  expect(sessions.has(session.sessionId)).toBe(true);
  expect(prompt.stopReason).toBe("end_turn");
  expect(updates).toEqual(["hello"]);
  connection.close();
});
