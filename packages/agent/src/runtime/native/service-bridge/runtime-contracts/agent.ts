export interface NativeAgentSkillsService {
  list(): unknown[];
  get(slug: string): unknown;
  generated?(): unknown[];
  summary?(): unknown;
  catalog?(limit?: number): unknown;
  searchCatalog?(query: string, limit?: number): unknown;
  synthesize(taskId: string): unknown;
}

export interface NativeTrajectoryLoggerService {
  exportLatest(): unknown;
  listBundles(): unknown[];
  compareLatest(): unknown;
  bundles?(): unknown[];
}

export interface NativeAgentOrchestratorService {
  createTask(
    title: string,
    objective: string,
    metadata?: Record<string, unknown>,
  ): unknown;
  getTask?(id: string): unknown;
  getChildren?(id: string): unknown[];
  tree?(id: string): unknown;
  aggregate?(id: string): unknown;
  queue(): unknown;
  overview?(): unknown;
  summary?(): {
    tasks: number;
    queuePending: number;
    activeWorkers: number;
    childTasksSupported: boolean;
    treeSupported: boolean;
    retrySupported: boolean;
  };
  tasks(): unknown[];
  spawnChild?(parentId: string, input: unknown): unknown;
  retryTask?(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): unknown;
  cancelTask?(id: string, note?: string): unknown;
  supervise?(
    runner: (task: unknown) => Promise<string>,
    runOptions?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface NativeCodingAgentService {
  read(path: string): unknown;
  write(path: string, content: string): unknown;
  search(query: string, limit?: number): unknown;
  repoStatus(): Promise<unknown>;
  repoDiff(): Promise<unknown>;
  repoLog(limit?: number): Promise<unknown>;
  run(command: string): Promise<unknown>;
  inspectProject?(targetPath?: string): Promise<unknown> | unknown;
  delegate?(
    title: string,
    objective: string,
    metadata?: Record<string, unknown>,
  ): unknown;
  tasks?(): unknown[];
  context?(
    taskDescription: string,
    options?: {
      sessionId?: string;
      workingDirectory?: string;
      maxIterations?: number;
      interactionMode?: unknown;
      connectorType?: unknown;
      metadata?: Record<string, string>;
    },
  ): unknown;
}

export interface NativeCodeGenerationService {
  capabilityDescription?: string;
  performResearch?: (...args: unknown[]) => unknown;
  generatePRD?: (...args: unknown[]) => unknown;
  performQA?: (...args: unknown[]) => unknown;
  generateCode?: (...args: unknown[]) => unknown;
  generateCodeInternal?: (...args: unknown[]) => unknown;
  runValidationSuite?: (...args: unknown[]) => unknown;
  generateCodeInChunks?: (...args: unknown[]) => unknown;
  installDependencies?: (...args: unknown[]) => unknown;
}
