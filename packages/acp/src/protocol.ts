import {
  type AgentApp,
  type AgentContext,
  agent,
  type CancelNotification,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  methods,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
} from "@agentclientprotocol/sdk";

export type {
  AcpConnection,
  ActiveSession,
  ActiveSessionMessage,
  AgentApp,
  AgentCapabilities,
  AgentConnection,
  AgentContext,
  CancelNotification,
  ClientApp,
  ClientCapabilities,
  ClientConnection,
  ClientContext,
  ContentBlock,
  CreateTerminalRequest,
  CreateTerminalResponse,
  InitializeRequest,
  InitializeResponse,
  KillTerminalRequest,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PermissionOption,
  PromptRequest,
  PromptResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  ReleaseTerminalRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  SessionUpdate,
  StopReason,
  Stream,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ToolCall,
  ToolCallContent,
  ToolCallLocation,
  ToolCallUpdate,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
export {
  AGENT_METHODS,
  agent,
  CLIENT_METHODS,
  client,
  methods,
  ndJsonStream,
  PROTOCOL_METHODS,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";

export interface DoolittleAcpAgentAdapter {
  initialize(
    params: InitializeRequest,
    context: AgentContext,
  ): Promise<InitializeResponse> | InitializeResponse;
  newSession(
    params: NewSessionRequest,
    context: AgentContext,
  ): Promise<NewSessionResponse> | NewSessionResponse;
  loadSession(
    params: LoadSessionRequest,
    context: AgentContext,
  ): Promise<LoadSessionResponse> | LoadSessionResponse;
  prompt(
    params: PromptRequest,
    context: AgentContext,
    signal: AbortSignal,
  ): Promise<PromptResponse> | PromptResponse;
  cancel(params: CancelNotification): Promise<void> | void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMeta(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNameValueList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === "string" &&
        typeof item.value === "string" &&
        isMeta(item._meta),
    )
  );
}

function isMcpServer(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isMeta(value._meta) ||
    typeof value.name !== "string"
  ) {
    return false;
  }
  if (value.type === "http" || value.type === "sse") {
    return typeof value.url === "string" && isNameValueList(value.headers);
  }
  if (value.type === "acp") {
    return typeof value.serverId === "string";
  }
  return (
    value.type === undefined &&
    typeof value.command === "string" &&
    isStringArray(value.args) &&
    isNameValueList(value.env)
  );
}

export function parseDoolittleLoadSessionRequest(
  value: unknown,
): LoadSessionRequest {
  if (!isRecord(value)) {
    throw new Error("ACP session/load params must be an object.");
  }
  const input = value;
  if (typeof input.sessionId !== "string" || !input.sessionId) {
    throw new Error("ACP session/load sessionId is required.");
  }
  if (typeof input.cwd !== "string" || !input.cwd) {
    throw new Error("ACP session/load cwd is required.");
  }
  if (
    input.additionalDirectories !== undefined &&
    !isStringArray(input.additionalDirectories)
  ) {
    throw new Error("ACP session/load additionalDirectories must be strings.");
  }
  if (
    !Array.isArray(input.mcpServers) ||
    !input.mcpServers.every(isMcpServer)
  ) {
    throw new Error(
      "ACP session/load mcpServers must contain valid ACP servers.",
    );
  }
  if (!isMeta(input._meta)) {
    throw new Error("ACP session/load _meta must be an object.");
  }
  return input as LoadSessionRequest;
}

/** Register Doolittle's stable ACP lifecycle with the official SDK. */
export function createDoolittleAcpAgent(
  adapter: DoolittleAcpAgentAdapter,
): AgentApp {
  return (
    agent({ name: "doolittle" })
      .onRequest(methods.agent.initialize, ({ params, client }) =>
        adapter.initialize(params, client),
      )
      .onRequest(methods.agent.session.new, ({ params, client }) =>
        adapter.newSession(params, client),
      )
      // SDK 1.3 maps this otherwise metadata-capable response through an
      // empty-object mapper. The public custom request overload preserves the
      // ACP _meta replay disclosure returned by the adapter.
      .onRequest<LoadSessionRequest, LoadSessionResponse>(
        methods.agent.session.load,
        parseDoolittleLoadSessionRequest,
        ({ params, client }) => adapter.loadSession(params, client),
      )
      .onRequest(methods.agent.session.prompt, ({ params, client, signal }) =>
        adapter.prompt(params, client, signal),
      )
      .onNotification(methods.agent.session.cancel, ({ params }) =>
        adapter.cancel(params),
      )
  );
}
