import type {
  NativeAgentOrchestratorService,
  NativeOrchestratorCreateTaskInput,
  NativeOrchestratorTaskDetail,
} from "@/runtime/native/service-bridge/runtime-contracts";

function taskDetail(
  input: NativeOrchestratorCreateTaskInput,
  id: string,
): NativeOrchestratorTaskDetail {
  const now = "2026-07-28T00:00:00.000Z";
  return {
    id,
    title: input.title,
    kind: input.kind ?? "coding",
    status: "open",
    priority: input.priority ?? "normal",
    paused: false,
    originalRequest: input.originalRequest ?? input.goal,
    sessionCount: 0,
    activeSessionCount: 0,
    latestSessionId: null,
    latestWorkdir: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    goal: input.goal,
    parentTaskId: input.parentTaskId ?? null,
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    providerPolicy: input.providerPolicy ?? null,
    metadata: input.metadata ?? {},
    sessions: [],
    messages: [],
    events: [],
  };
}

export interface OfficialOrchestratorTestFixture {
  service: NativeAgentOrchestratorService;
  tasks: Map<string, NativeOrchestratorTaskDetail>;
  runtime: {
    getService(name: string): NativeAgentOrchestratorService | null;
  };
}

export function createOfficialOrchestratorTestFixture(): OfficialOrchestratorTestFixture {
  const tasks = new Map<string, NativeOrchestratorTaskDetail>();
  let nextId = 1;
  const service: NativeAgentOrchestratorService = {
    async createTask(input) {
      const task = taskDetail(input, `official-task-${nextId++}`);
      tasks.set(task.id, task);
      return structuredClone(task);
    },
    async listTasks() {
      return Array.from(tasks.values()).map((task) => structuredClone(task));
    },
    async getTask(id) {
      const task = tasks.get(id);
      return task ? structuredClone(task) : null;
    },
    async updateTask(id, patch) {
      const task = tasks.get(id);
      if (!task) return null;
      Object.assign(task, patch, { updatedAt: task.updatedAt });
      return structuredClone(task);
    },
    async pauseTask(id) {
      const task = tasks.get(id);
      if (!task) return null;
      task.paused = true;
      return structuredClone(task);
    },
    async resumeTask(id) {
      const task = tasks.get(id);
      if (!task) return null;
      task.paused = false;
      return structuredClone(task);
    },
    async archiveTask(id) {
      const task = tasks.get(id);
      if (!task) return null;
      task.status = "archived";
      return structuredClone(task);
    },
    async reopenTask(id) {
      const task = tasks.get(id);
      if (!task) return null;
      task.status = "open";
      return structuredClone(task);
    },
    async validateTask(id, result) {
      const task = tasks.get(id);
      if (!task) return null;
      task.status = result.passed ? "done" : "active";
      task.summary = result.summary;
      return structuredClone(task);
    },
    async retryTaskTurn(id) {
      const task = tasks.get(id);
      if (!task) return null;
      task.status = "active";
      return structuredClone(task);
    },
    async restartTask(id) {
      const task = tasks.get(id);
      if (!task) return null;
      task.status = "active";
      return structuredClone(task);
    },
    async addMessage(id, input) {
      const task = tasks.get(id);
      if (!task) return false;
      task.messages.push({
        senderKind: input.senderKind,
        content: input.content,
        createdAt: task.updatedAt,
      });
      return true;
    },
    async spawnAgentForTask(id, options) {
      const task = tasks.get(id);
      if (!task) return null;
      task.status = "active";
      task.sessionCount += 1;
      task.activeSessionCount += 1;
      task.latestSessionId = `official-session-${task.sessionCount}`;
      task.latestWorkdir = options?.workdir ?? null;
      return structuredClone(task);
    },
    async stopTaskAgent() {
      return true;
    },
    async getStatus() {
      const values = Array.from(tasks.values());
      const byStatus = {
        open: 0,
        active: 0,
        waiting_on_user: 0,
        blocked: 0,
        validating: 0,
        done: 0,
        failed: 0,
        archived: 0,
        interrupted: 0,
      };
      for (const task of values) byStatus[task.status] += 1;
      return {
        taskCount: values.length,
        activeTaskCount: byStatus.active,
        pausedTaskCount: values.filter((task) => task.paused).length,
        blockedTaskCount: byStatus.blocked,
        validatingTaskCount: byStatus.validating,
        sessionCount: values.reduce((sum, task) => sum + task.sessionCount, 0),
        activeSessionCount: values.reduce(
          (sum, task) => sum + task.activeSessionCount,
          0,
        ),
        byStatus,
      };
    },
  };

  return {
    service,
    tasks,
    runtime: {
      getService: (name) =>
        name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
    },
  };
}
