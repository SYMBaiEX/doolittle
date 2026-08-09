import type {
  CreateTerminalRequest,
  InitializeRequest,
  KillTerminalRequest,
  LoadSessionRequest,
  NewSessionRequest,
  PromptRequest,
  ReadTextFileRequest,
  ReleaseTerminalRequest,
  TerminalOutputRequest,
  WaitForTerminalExitRequest,
  WriteTextFileRequest,
} from "@doolittle/acp";
import type {
  AcpEditorSummary,
  AcpPackageMetadata,
  AcpRegistryEntry,
  AcpSessionSummary,
  AcpToolDefinition,
  EnvConfig,
  SessionSummary,
  StoredMessage,
  ToolDefinition,
} from "@/types";
import { AcpCatalog } from "./catalog";
import { createAcpServicePaths } from "./paths";
import { AcpPersistence } from "./persistence";
import { AcpProtocolRuntime } from "./protocol-runtime";
import { createAcpServiceStatus } from "./status";
import { AcpTelemetry } from "./telemetry";
import type {
  AcpEditorContext,
  AcpProtocolHost,
  AcpSessionSummarySource,
} from "./types";

export class AcpService {
  private readonly paths: ReturnType<typeof createAcpServicePaths>;
  private readonly catalog: AcpCatalog;
  private readonly persistence: AcpPersistence;
  private readonly protocol: AcpProtocolRuntime;
  private readonly telemetry = new AcpTelemetry();
  private getRuntimeTools: () => ToolDefinition[] = () => [];
  private runtimeToolsBound = false;

  constructor(
    private readonly config: EnvConfig,
    private readonly getSessionSummary: () => AcpSessionSummarySource,
    private readonly listSessions: (limit: number) => SessionSummary[],
    getSessionMessages: (
      sessionId: string,
      limit: number,
      offset?: number,
    ) => StoredMessage[] = () => [],
  ) {
    this.paths = createAcpServicePaths(this.config.dataDir);
    this.catalog = new AcpCatalog(
      this.config,
      this.paths,
      () => this.getRuntimeTools(),
      this.getSessionSummary,
      this.listSessions,
    );
    this.persistence = new AcpPersistence(this.paths);
    this.protocol = new AcpProtocolRuntime(
      () => this.config.workspaceDir,
      (sessionId) =>
        this.listSessions(1_000).some(
          (session) => session.sessionId === sessionId,
        ),
      getSessionMessages,
      (event, detail) => this.telemetry.recordProtocolEvent(event, detail),
    );
  }

  bindProtocolHost(host: AcpProtocolHost): void {
    this.protocol.bindHost(host);
  }

  bindRuntimeTools(getTools: () => ToolDefinition[]): void {
    this.getRuntimeTools = getTools;
    this.runtimeToolsBound = true;
  }

  agentApp() {
    return this.protocol.agentApp();
  }

  initializeProtocol(params?: InitializeRequest) {
    return this.protocol.initialize(params);
  }

  newProtocolSession(params?: Partial<NewSessionRequest>) {
    return this.protocol.newSession(params);
  }

  loadProtocolSession(params: LoadSessionRequest) {
    return this.protocol.loadSession(params);
  }

  promptProtocolSession(params: PromptRequest) {
    return this.protocol.prompt(params);
  }

  cancelProtocolSession(sessionId: string) {
    return this.protocol.notifyCancel(sessionId);
  }

  updateEditorContext(sessionId: string, context: AcpEditorContext) {
    return this.protocol.updateEditorContext(sessionId, context);
  }

  latestEditorContext(workspaceRoot = this.config.workspaceDir) {
    return this.protocol.latestEditorContext(workspaceRoot);
  }

  protocolUpdates(sessionId: string, cursor?: number) {
    return this.protocol.sessionUpdates(sessionId, cursor);
  }

  readTextFile(params: ReadTextFileRequest) {
    return this.protocol.readTextFile(params);
  }

  writeTextFile(params: WriteTextFileRequest) {
    return this.protocol.writeTextFile(params);
  }

  createTerminal(params: CreateTerminalRequest) {
    return this.protocol.createTerminal(params);
  }

  terminalOutput(params: TerminalOutputRequest) {
    return this.protocol.terminalOutput(params);
  }

  waitForTerminalExit(params: WaitForTerminalExitRequest) {
    return this.protocol.waitForTerminalExit(params);
  }

  killTerminal(params: KillTerminalRequest) {
    return this.protocol.killTerminal(params);
  }

  releaseTerminal(params: ReleaseTerminalRequest) {
    return this.protocol.releaseTerminal(params);
  }

  status() {
    const telemetry = this.telemetry.snapshot();
    return createAcpServiceStatus({
      command: this.config.acpServerCommand?.trim(),
      timeoutMs: this.config.acpTimeoutMs,
      registryPath: this.paths.registryPath,
      exportDir: this.paths.exportDir,
      importDir: this.paths.importDir,
      toolCount: this.tools().length,
      toolSource: this.runtimeToolsBound ? "eliza-runtime" : "unbound",
      lastProbeAt: telemetry.lastProbeAt,
      lastInvocationAt: telemetry.lastInvocationAt,
      lastPublishAt: telemetry.lastPublishAt,
      lastExportAt: telemetry.lastExportAt,
      lastImportAt: telemetry.lastImportAt,
      lastError: telemetry.lastError,
      protocolEvents: telemetry.protocolEvents,
      protocolEventCounts: telemetry.protocolEventCounts,
      lastProtocolEvent: telemetry.lastProtocolEvent,
    });
  }

  packageMetadata(): AcpPackageMetadata {
    return this.catalog.packageMetadata();
  }

  editorSummary(): AcpEditorSummary {
    return this.catalog.editorSummary(this.telemetry.snapshot());
  }

  sessionSummary(limit = 5): AcpSessionSummary {
    return this.catalog.sessionSummary(limit);
  }

  registry(): AcpRegistryEntry {
    return this.catalog.registry();
  }

  publishRegistry(): { path: string; entry: AcpRegistryEntry } {
    const published = this.persistence.publishRegistry(this.registry());
    this.telemetry.recordPublish(published.publishedAt);
    return {
      path: published.path,
      entry: published.entry,
    };
  }

  tools(): AcpToolDefinition[] {
    return this.catalog.tools();
  }

  searchTools(query: string): AcpToolDefinition[] {
    return this.catalog.searchTools(query);
  }

  describeTool(name: string): string {
    return this.catalog.describeTool(name);
  }

  exportBundle(label = "latest"): {
    path: string;
    label: string;
    package: AcpPackageMetadata;
    registry: AcpRegistryEntry;
    toolCount: number;
  } {
    const exported = this.persistence.exportBundle({
      label,
      packageMetadata: this.packageMetadata(),
      status: this.status(),
      editorSummary: this.editorSummary(),
      registry: this.registry(),
      sessions: this.sessionSummary(),
      tools: this.tools(),
    });
    this.telemetry.recordExport(exported.exportedAt);
    return {
      path: exported.path,
      label: exported.label,
      package: exported.package,
      registry: exported.registry,
      toolCount: exported.toolCount,
    };
  }

  importBundle(input: string): {
    path: string;
    importedAt: string;
    label?: string;
    packageName?: string;
    toolCount?: number;
  } {
    const imported = this.persistence.importBundle(input);
    this.telemetry.recordImport(imported.importedAt);
    return {
      path: imported.path,
      importedAt: imported.importedAt,
      label: imported.label,
      packageName: imported.packageName,
      toolCount: imported.toolCount,
    };
  }

  async probe(): Promise<{ ok: boolean; detail: string }> {
    try {
      const initialized = await this.initializeProtocol();
      this.telemetry.recordProbe(true);
      return {
        ok: true,
        detail: `ACP v${initialized.protocolVersion} initialized with the official SDK.`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.telemetry.recordProbe(false, detail);
      return { ok: false, detail };
    }
  }

  async invoke(input: string): Promise<{ ok: boolean; output: string }> {
    try {
      const session = await this.newProtocolSession();
      const result = await this.promptProtocolSession({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: input }],
      });
      const output = result.updates
        .filter((entry) => entry.update.sessionUpdate === "agent_message_chunk")
        .map((entry) =>
          entry.update.sessionUpdate === "agent_message_chunk" &&
          entry.update.content.type === "text"
            ? entry.update.content.text
            : "",
        )
        .join("");
      this.telemetry.recordInvocation(true);
      return { ok: true, output };
    } catch (error) {
      const output = error instanceof Error ? error.message : String(error);
      this.telemetry.recordInvocation(false, output);
      return { ok: false, output };
    }
  }

  async invokeTool(
    name: string,
    _input: Record<string, unknown>,
  ): Promise<{ ok: boolean; tool: string; output: string }> {
    return {
      ok: false,
      tool: name,
      output:
        "Stable ACP v1 does not define direct tool invocation. Start a session and prompt the Eliza runtime instead.",
    };
  }
}
