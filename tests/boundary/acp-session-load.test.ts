import { describe, expect, it } from "vitest";
import {
  type ClientConnection,
  client,
  createDoolittleAcpAgent,
  type LoadSessionRequest,
  methods,
} from "../../packages/acp/src";

async function connectDoolittleAgent() {
  const received: LoadSessionRequest[] = [];
  const app = createDoolittleAcpAgent({
    initialize: () => ({ protocolVersion: 1 }),
    newSession: () => ({ sessionId: "session-1" }),
    loadSession: (params) => {
      received.push(params);
      return { _meta: { "doolittle/replayed-updates": 2 } };
    },
    prompt: () => ({ stopReason: "end_turn" }),
    cancel: () => {},
  });
  let connection: ClientConnection | undefined;
  app.connect(
    client({ name: "test-client" }).onConnect((value) => {
      connection = value;
    }),
  );
  if (!connection)
    throw new Error("ACP client connection was not established.");
  await connection.agent.request(methods.agent.initialize, {
    protocolVersion: 1,
    clientCapabilities: {},
  });
  return { connection, received };
}

describe("ACP session/load", () => {
  it("accepts null optional lists and preserves the replay _meta", async () => {
    const { connection, received } = await connectDoolittleAgent();
    const response = await connection.agent.request(
      methods.agent.session.load,
      {
        sessionId: "session-1",
        cwd: "/workspace",
        additionalDirectories: null,
        mcpServers: [
          { name: "stdio", command: "server", args: null, env: null },
          {
            type: "http",
            name: "http",
            url: "https://mcp.test",
            headers: null,
          },
        ],
      } as unknown as LoadSessionRequest,
    );

    expect(response).toEqual({ _meta: { "doolittle/replayed-updates": 2 } });
    expect(received).toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        cwd: "/workspace",
        additionalDirectories: [],
        mcpServers: [
          { name: "stdio", command: "server", args: [], env: [] },
          { type: "http", name: "http", url: "https://mcp.test", headers: [] },
        ],
      }),
    ]);
  });

  it("defaults null mcpServers to an empty list", async () => {
    const { connection, received } = await connectDoolittleAgent();
    await connection.agent.request(methods.agent.session.load, {
      sessionId: "session-1",
      cwd: "/workspace",
      mcpServers: null,
    } as unknown as LoadSessionRequest);

    expect(received[0]?.mcpServers).toEqual([]);
  });

  it("rejects a request without a cwd", async () => {
    const { connection, received } = await connectDoolittleAgent();
    await expect(
      connection.agent.request(methods.agent.session.load, {
        sessionId: "session-1",
        mcpServers: [],
      } as unknown as LoadSessionRequest),
    ).rejects.toThrow();
    expect(received).toEqual([]);
  });
});
