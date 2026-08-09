import {
  type AgentContext,
  type ClientApp,
  type ClientCapabilities,
  type ClientConnection,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  client,
  type KillTerminalRequest,
  methods,
  type ReadTextFileRequest,
  type ReleaseTerminalRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionUpdate,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
} from "@doolittle/acp";

type AcpHostOperation = "read" | "write" | "terminal";

interface AcpHostBindings {
  readWorkspace(path: string, options?: ReadTextFileRequest): string;
  writeWorkspace(path: string, content: string): Promise<string>;
  requestPermission(
    params: RequestPermissionRequest,
    signal: AbortSignal,
  ): Promise<RequestPermissionResponse>;
  createTerminal(
    params: CreateTerminalRequest,
    signal: AbortSignal,
  ): Promise<CreateTerminalResponse>;
  terminalOutput(
    params: TerminalOutputRequest,
  ): Promise<TerminalOutputResponse> | TerminalOutputResponse;
  waitForTerminalExit(
    params: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse>;
  killTerminal(params: KillTerminalRequest): Promise<void>;
  releaseTerminal(params: ReleaseTerminalRequest): Promise<void>;
}

export interface AcpHostProxyDependencies {
  host(): AcpHostBindings;
  ensureInitialized(): Promise<void>;
  agentClient(): AgentContext;
  clientCapabilities(sessionId: string): ClientCapabilities;
  recordTelemetry(event: string, detail?: Record<string, unknown>): void;
  onSessionUpdate(sessionId: string, update: SessionUpdate): void;
}

/** ACP client handlers and the agent-facing host request boundary. */
export class AcpHostProxy {
  private readonly app: ClientApp;
  private localConnection?: ClientConnection;

  constructor(private readonly dependencies: AcpHostProxyDependencies) {
    this.app = client({ name: "doolittle-local-client" })
      .onConnect((connection) => {
        this.localConnection = connection;
      })
      .onRequest(
        methods.client.session.requestPermission,
        ({ params, signal }) =>
          this.dependencies.host().requestPermission(params, signal),
      )
      .onRequest(methods.client.fs.readTextFile, ({ params }) => {
        this.assertCapability(params.sessionId, "read");
        return {
          content: this.dependencies.host().readWorkspace(params.path, params),
        };
      })
      .onRequest(methods.client.fs.writeTextFile, async ({ params }) => {
        this.assertCapability(params.sessionId, "write");
        if (params._meta?.["doolittle/permission-granted"] !== true) {
          throw new Error(
            "ACP file writes require an approved permission request.",
          );
        }
        await this.dependencies
          .host()
          .writeWorkspace(params.path, params.content);
        return {};
      })
      .onRequest(methods.client.terminal.create, ({ params, signal }) => {
        this.assertCapability(params.sessionId, "terminal");
        return this.dependencies.host().createTerminal(params, signal);
      })
      .onRequest(methods.client.terminal.output, ({ params }) => {
        this.assertCapability(params.sessionId, "terminal");
        return this.dependencies.host().terminalOutput(params);
      })
      .onRequest(methods.client.terminal.waitForExit, ({ params }) => {
        this.assertCapability(params.sessionId, "terminal");
        return this.dependencies.host().waitForTerminalExit(params);
      })
      .onRequest(methods.client.terminal.kill, async ({ params }) => {
        this.assertCapability(params.sessionId, "terminal");
        await this.dependencies.host().killTerminal(params);
        return {};
      })
      .onRequest(methods.client.terminal.release, async ({ params }) => {
        this.assertCapability(params.sessionId, "terminal");
        await this.dependencies.host().releaseTerminal(params);
        return {};
      })
      .onNotification(methods.client.session.update, ({ params }) => {
        this.dependencies.onSessionUpdate(params.sessionId, params.update);
      });
  }

  clientApp(): ClientApp {
    return this.app;
  }

  connection(): ClientConnection {
    if (!this.localConnection) {
      throw new Error("ACP local client connection was not established.");
    }
    return this.localConnection;
  }

  async readTextFile(params: ReadTextFileRequest): Promise<string> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "read");
    const response = await this.dependencies
      .agentClient()
      .request(methods.client.fs.readTextFile, params);
    this.dependencies.recordTelemetry("fs.read", {
      sessionId: params.sessionId,
      path: params.path,
    });
    return response.content;
  }

  async writeTextFile(
    params: WriteTextFileRequest,
  ): Promise<{ written: boolean; permission: RequestPermissionResponse }> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "write");
    const toolCallId = `acp-write:${crypto.randomUUID()}`;
    const permission = await this.requestPermission({
      sessionId: params.sessionId,
      toolCall: {
        toolCallId,
        title: `Write ${params.path}`,
        kind: "edit",
        status: "pending",
        locations: [{ path: params.path }],
        rawInput: { path: params.path },
      },
      options: permissionOptions(),
    });
    if (!isAllowed(permission)) return { written: false, permission };
    await this.dependencies
      .agentClient()
      .request(methods.client.fs.writeTextFile, {
        ...params,
        _meta: {
          ...(params._meta ?? {}),
          "doolittle/permission-granted": true,
          "doolittle/tool-call-id": toolCallId,
        },
      });
    this.dependencies.recordTelemetry("fs.write", {
      sessionId: params.sessionId,
      path: params.path,
    });
    return { written: true, permission };
  }

  async createTerminal(
    params: CreateTerminalRequest,
  ): Promise<{ terminalId?: string; permission: RequestPermissionResponse }> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "terminal");
    const toolCallId = `acp-terminal:${crypto.randomUUID()}`;
    const permission = await this.requestPermission({
      sessionId: params.sessionId,
      toolCall: {
        toolCallId,
        title: `Run ${params.command}`,
        kind: "execute",
        status: "pending",
        rawInput: { command: params.command, args: params.args ?? [] },
      },
      options: permissionOptions(),
    });
    if (!isAllowed(permission)) return { permission };
    const response = await this.dependencies
      .agentClient()
      .request(methods.client.terminal.create, {
        ...params,
        _meta: {
          ...(params._meta ?? {}),
          "doolittle/permission-granted": true,
          "doolittle/tool-call-id": toolCallId,
        },
      });
    this.dependencies.recordTelemetry("terminal.create", {
      sessionId: params.sessionId,
      terminalId: response.terminalId,
    });
    return { terminalId: response.terminalId, permission };
  }

  async terminalOutput(
    params: TerminalOutputRequest,
  ): Promise<TerminalOutputResponse> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "terminal");
    return this.dependencies
      .agentClient()
      .request(methods.client.terminal.output, params);
  }

  async waitForTerminalExit(
    params: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "terminal");
    return this.dependencies
      .agentClient()
      .request(methods.client.terminal.waitForExit, params);
  }

  async killTerminal(params: KillTerminalRequest): Promise<void> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "terminal");
    await this.dependencies
      .agentClient()
      .request(methods.client.terminal.kill, params);
  }

  async releaseTerminal(params: ReleaseTerminalRequest): Promise<void> {
    await this.dependencies.ensureInitialized();
    this.assertCapability(params.sessionId, "terminal");
    await this.dependencies
      .agentClient()
      .request(methods.client.terminal.release, params);
  }

  private async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    return this.dependencies
      .agentClient()
      .request(methods.client.session.requestPermission, params);
  }

  private assertCapability(
    sessionId: string,
    operation: AcpHostOperation,
  ): void {
    const capabilities = this.dependencies.clientCapabilities(sessionId);
    const supported =
      operation === "terminal"
        ? capabilities.terminal
        : operation === "read"
          ? capabilities.fs?.readTextFile
          : capabilities.fs?.writeTextFile;
    if (!supported) {
      const capability =
        operation === "terminal" ? "terminal" : `fs/${operation}_text_file`;
      throw new Error(
        `The ACP client did not advertise ${capability} support.`,
      );
    }
  }
}

function isAllowed(permission: RequestPermissionResponse): boolean {
  return (
    permission.outcome.outcome === "selected" &&
    permission.outcome.optionId.startsWith("allow")
  );
}

function permissionOptions() {
  return [
    { optionId: "allow_once", name: "Allow once", kind: "allow_once" as const },
    { optionId: "reject_once", name: "Reject", kind: "reject_once" as const },
  ];
}
