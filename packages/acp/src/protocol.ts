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

/** Register Doolittle's stable ACP lifecycle with the official SDK. */
export function createDoolittleAcpAgent(
  adapter: DoolittleAcpAgentAdapter,
): AgentApp {
  return agent({ name: "doolittle" })
    .onRequest(methods.agent.initialize, ({ params, client }) =>
      adapter.initialize(params, client),
    )
    .onRequest(methods.agent.session.new, ({ params, client }) =>
      adapter.newSession(params, client),
    )
    .onRequest(methods.agent.session.load, ({ params, client }) =>
      adapter.loadSession(params, client),
    )
    .onRequest(methods.agent.session.prompt, ({ params, client, signal }) =>
      adapter.prompt(params, client, signal),
    )
    .onNotification(methods.agent.session.cancel, ({ params }) =>
      adapter.cancel(params),
    );
}
