import { createHash, randomUUID } from "node:crypto";
import type { AutomationJobRecord } from "@doolittle/contracts";
import {
  type AutomationTargetApproval,
  type AutomationTargetFire,
  BotAutomationLedger,
} from "./bot-automation-ledger";
import { effectivePermissions } from "./bot-consultation-broker";
import type { BotProcessRegistry } from "./bot-process-registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TERMINAL = new Set(["complete", "cancelled", "error"]);
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function definition(job: AutomationJobRecord): string {
  return digest({
    id: job.id,
    targetBotId: job.targetBotId,
    name: job.name,
    prompt: job.prompt,
    schedule: job.schedule,
    delivery: job.delivery,
    skills: job.skills,
    runtime: job.runtime ?? null,
    trigger: job.trigger ?? null,
    condition: job.condition ?? null,
    action: job.action ?? null,
  });
}
function assertNamedJob(job: AutomationJobRecord): void {
  if (
    !job ||
    typeof job.id !== "string" ||
    !UUID.test(job.id) ||
    typeof job.targetBotId !== "string" ||
    !UUID.test(job.targetBotId) ||
    typeof job.name !== "string" ||
    !job.name.trim() ||
    job.name.length > 300 ||
    typeof job.prompt !== "string" ||
    !job.prompt.trim() ||
    job.prompt.length > 32_000 ||
    typeof job.schedule !== "string" ||
    job.schedule.length > 300 ||
    !Array.isArray(job.skills) ||
    job.skills.length > 0 ||
    job.runtime !== undefined ||
    job.delivery === "home" ||
    !["local", "origin"].includes(job.delivery) ||
    (job.trigger && !["schedule", "manual"].includes(job.trigger.type)) ||
    (job.action &&
      (!["prompt", "run-agent"].includes(job.action.type) ||
        (job.action as { prompt?: unknown }).prompt !== job.prompt))
  )
    throw new Error(
      "Named automations support prompt/run-agent schedule or manual turns and local history receipts only. Webhooks, home delivery, runtime overrides, and lead-loaded skills are unsupported.",
    );
}
async function read(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok)
    throw new Error("The authoritative automation runtime is unavailable.");
  const raw = await response.text();
  if (raw.length > 2_000_000)
    throw new Error("Automation response is too large.");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Automation response is invalid.");
  return value;
}
export interface AutomationNativeConsent {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
}

/** Durable submission bookkeeping over chat runs, not another scheduler/coordinator. */
export class BotAutomationBroker {
  private readonly storedLedger?: BotAutomationLedger;
  get ledger(): BotAutomationLedger {
    if (!this.storedLedger)
      throw new Error(
        "Named automation bookkeeping requires recovery. Its original files are preserved; default conversations remain available.",
      );
    return this.storedLedger;
  }
  private generation = 0;
  private readonly botGeneration = new Map<string, number>();
  constructor(
    private readonly bots: BotProcessRegistry,
    dataDir: string,
    private readonly runtimeFetch: typeof fetch = fetch,
    private readonly confirm?: (
      request: AutomationNativeConsent,
    ) => Promise<boolean>,
  ) {
    try {
      this.storedLedger = new BotAutomationLedger(dataDir);
    } catch {
      /* fail closed for named automation only; preserve original files */
    }
  }

  cancelPendingValidations(): void {
    this.generation += 1;
  }
  private authority(caller: string): void {
    if (!this.bots.get(caller).isDefault)
      throw new Error(
        "Only the application-owned default scheduler may dispatch automations.",
      );
  }
  private async jobs(): Promise<AutomationJobRecord[]> {
    const state = (await this.bots.backendFor("default")).getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The application scheduler is unavailable.");
    const payload = await read(
      await this.runtimeFetch(`${state.url}/cron/jobs`, {
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!Array.isArray(payload.jobs) || payload.jobs.length > 5_000)
      throw new Error("The authoritative automation catalog is invalid.");
    return payload.jobs as AutomationJobRecord[];
  }
  private async job(id: string): Promise<AutomationJobRecord> {
    const job = (await this.jobs()).find((row) => row?.id === id);
    if (!job) throw new Error("Automation was removed or is unavailable.");
    return job;
  }
  private check(
    job: AutomationJobRecord,
    approval?: AutomationTargetApproval,
  ): AutomationTargetApproval {
    assertNamedJob(job);
    const target = this.bots.get(job.targetBotId);
    if (target.isDefault || target.id !== job.targetBotId)
      throw new Error("Use the legacy default target for the lead bot.");
    const authorized =
      approval ?? this.ledger.approval(job.targetApprovalId ?? "");
    const permissions = effectivePermissions(this.bots.get("default"), target);
    if (
      !authorized ||
      authorized.jobId !== job.id ||
      authorized.targetBotId !== target.id ||
      authorized.definitionDigest !== definition(job) ||
      authorized.targetRevision !== target.updatedAt ||
      digest(authorized.permissions) !== digest(permissions)
    )
      throw new Error(
        "Named automation authorization changed. Review and approve its current target and definition before another fire.",
      );
    return authorized;
  }
  async validate(
    caller: string,
    candidate: AutomationJobRecord,
    signal?: AbortSignal,
  ): Promise<{ targetBotId: string; approvalId: string }> {
    this.authority(caller);
    const job = structuredClone(candidate);
    assertNamedJob(job);
    void this.ledger;
    const existing = (await this.jobs()).find((row) => row.id === job.id);
    if (existing && (existing.targetBotId ?? "default") !== job.targetBotId)
      throw new Error("Automation target is immutable.");
    const target = this.bots.get(job.targetBotId);
    if (target.isDefault || target.id !== job.targetBotId)
      throw new Error("Use default for the application lead.");
    const permissions = effectivePermissions(this.bots.get("default"), target);
    const generation = this.generation;
    const botGeneration = this.botGeneration.get(target.id) ?? 0;
    const approved = await this.confirm?.({
      title: existing
        ? "Approve named automation changes?"
        : "Create named automation?",
      message: `${job.name} — ${target.name} (${target.id})`,
      detail: `Trigger: ${job.trigger?.type ?? "schedule"}; ${job.schedule}.\nWorkspace: ${target.workspacePath}.\nMutation permission: ${permissions.allowMutation ? "approved" : "read only"}. No worker scheduler, connector gateway, home delivery, or model override is granted.\nPrompt preview:\n${job.prompt.slice(0, 1_500)}`,
      confirmLabel: "Approve automation",
    });
    signal?.throwIfAborted();
    if (
      approved !== true ||
      generation !== this.generation ||
      botGeneration !== (this.botGeneration.get(target.id) ?? 0)
    )
      throw new Error(
        "Named automation approval was cancelled or its scope changed.",
      );
    await this.bots.validateAutomationConnection(target.id);
    signal?.throwIfAborted();
    const current = this.bots.get(target.id);
    if (
      current.updatedAt !== target.updatedAt ||
      digest(effectivePermissions(this.bots.get("default"), current)) !==
        digest(permissions) ||
      generation !== this.generation ||
      botGeneration !== (this.botGeneration.get(target.id) ?? 0)
    )
      throw new Error("The automation target changed during approval.");
    const latest = (await this.jobs()).find((row) => row.id === job.id);
    if (latest && (latest.targetBotId ?? "default") !== target.id)
      throw new Error("Automation target is immutable.");
    if (
      existing
        ? !latest || definition(existing) !== definition(latest)
        : Boolean(latest)
    )
      throw new Error(
        "Automation changed during approval. Reload its current definition.",
      );
    signal?.throwIfAborted();
    if (
      generation !== this.generation ||
      botGeneration !== (this.botGeneration.get(target.id) ?? 0)
    )
      throw new Error("Named automation approval was cancelled.");
    if (
      this.bots.get(target.id).updatedAt !== target.updatedAt ||
      digest(
        effectivePermissions(
          this.bots.get("default"),
          this.bots.get(target.id),
        ),
      ) !== digest(permissions)
    )
      throw new Error("The automation target changed during approval.");
    const approval: AutomationTargetApproval = {
      id: randomUUID(),
      jobId: job.id,
      targetBotId: target.id,
      targetRevision: target.updatedAt,
      definitionDigest: definition(job),
      permissions,
      createdAt: new Date().toISOString(),
    };
    this.ledger.approve(approval);
    return { targetBotId: target.id, approvalId: approval.id };
  }
  async dispatch(
    caller: string,
    input: {
      jobId: string;
      idempotencyKey: string;
      source: "schedule" | "manual";
      payload?: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ): Promise<AutomationTargetFire> {
    this.authority(caller);
    const generation = this.generation;
    const botGenerations = new Map(this.botGeneration);
    if (
      !input ||
      typeof input.jobId !== "string" ||
      !UUID.test(input.jobId) ||
      typeof input.idempotencyKey !== "string" ||
      !input.idempotencyKey ||
      input.idempotencyKey.length > 512 ||
      !["schedule", "manual"].includes(input.source) ||
      (input.payload !== undefined &&
        (!input.payload ||
          typeof input.payload !== "object" ||
          Array.isArray(input.payload) ||
          JSON.stringify(input.payload).length > 12_000))
    )
      throw new Error("A stable SDK automation fire identity is required.");
    const key = digest([input.jobId, input.idempotencyKey]);
    const previous = this.ledger.forKey(input.jobId, key);
    if (previous) return previous;
    const job = await this.job(input.jobId);
    const approval = this.check(job);
    const assertPending = () => {
      signal?.throwIfAborted();
      if (
        generation !== this.generation ||
        (botGenerations.get(approval.targetBotId) ?? 0) !==
          (this.botGeneration.get(approval.targetBotId) ?? 0)
      )
        throw new Error("Automation dispatch was cancelled.");
    };
    assertPending();
    if (
      input.source === "schedule" &&
      (job.status !== "active" || job.trigger?.type === "manual")
    )
      throw new Error("This automation is paused or not scheduled.");
    const existing = this.ledger.forKey(input.jobId, key);
    if (existing) return existing;
    const now = new Date().toISOString();
    const fireId = randomUUID();
    const record: AutomationTargetFire = {
      fireId,
      fireKeyDigest: key,
      jobId: job.id,
      approvalId: approval.id,
      targetBotId: approval.targetBotId,
      sessionId: `automation:${job.id}:${fireId}`,
      runId: `automation:${fireId}`,
      status: "prepared",
      createdAt: now,
      updatedAt: now,
    };
    this.ledger.prepare(record);
    try {
      assertPending();
      await this.bots.activate(record.targetBotId);
      await this.bots.validateAutomationConnection(record.targetBotId);
      assertPending();
      if (this.ledger.get(fireId)?.status !== "prepared")
        throw new Error("Automation was cancelled before submission.");
      const target = this.bots.get(record.targetBotId);
      const state = (await this.bots.backendFor(target.id)).getState();
      // Resolve every asynchronous worker seam before the final authoritative job read.
      const current = await this.job(job.id);
      this.check(current, approval);
      assertPending();
      if (input.source === "schedule" && current.status !== "active")
        throw new Error("Automation was paused before submission.");
      if (
        this.ledger.get(fireId)?.status !== "prepared" ||
        state.phase !== "ready" ||
        !state.url
      )
        throw new Error("The selected automation bot is unavailable.");
      this.bots.bindConversation(target.id, record.sessionId, target.projectId);
      this.bots.bindRun(target.id, record.sessionId, record.runId);
      let response: Response;
      try {
        response = await this.runtimeFetch(`${state.url}/chat/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            runId: record.runId,
            roomId: record.sessionId,
            message: `${current.action?.type === "prompt" || current.action?.type === "run-agent" ? current.action.prompt : current.prompt}${input.payload ? `\n\nTrigger payload:\n${JSON.stringify(input.payload)}` : ""}`,
            source: "desktop-automation",
            workspaceDir: target.workspacePath,
            ...(target.projectId ? { projectId: target.projectId } : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        if (signal?.aborted || this.ledger.get(fireId)?.status === "cancelled")
          await this.cancelFire(fireId, true);
        return this.ledger.get(fireId) as AutomationTargetFire;
      } // uncertain acknowledgement: never replay
      if (response.status !== 202) {
        this.ledger.update(fireId, "error");
        throw new Error(`Named automation rejected (HTTP ${response.status}).`);
      }
      const receipt = await read(response);
      if (
        receipt.run_id !== record.runId ||
        receipt.room_id !== record.sessionId
      )
        throw new Error(
          "Named automation acknowledgement was mismatched; the run will not be replayed.",
        );
      if (signal?.aborted || this.ledger.get(fireId)?.status === "cancelled") {
        await this.cancelFire(fireId, true);
        return this.ledger.get(fireId) as AutomationTargetFire;
      }
      return this.ledger.update(fireId, "accepted");
    } catch (error) {
      if (signal?.aborted) await this.cancelFire(fireId, true);
      else if (!this.bots.conversations.getRun(record.runId))
        this.ledger.update(fireId, "error");
      throw error;
    }
  }
  admission(botId: string, payload: unknown): unknown {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return payload;
    const input = payload as Record<string, unknown>;
    if (
      typeof input.runId !== "string" ||
      !input.runId.startsWith("automation:")
    )
      return payload;
    const fire = this.ledger.byRun(input.runId);
    const owner = this.bots.conversations.getRun(input.runId);
    if (
      !fire ||
      TERMINAL.has(fire.status) ||
      fire.targetBotId !== botId ||
      fire.sessionId !== input.sessionId ||
      owner?.botId !== botId ||
      owner.sessionId !== fire.sessionId
    )
      throw new Error(
        "Automation execution has no active host-owned fire binding.",
      );
    return { ...input, kind: "automatic-acp" };
  }
  status(
    caller: string,
    input: { jobId: string; idempotencyKey: string },
  ): { status: AutomationTargetFire["status"] | "unsubmitted" } {
    this.authority(caller);
    if (
      !input ||
      !UUID.test(input.jobId) ||
      typeof input.idempotencyKey !== "string" ||
      !input.idempotencyKey ||
      input.idempotencyKey.length > 512
    )
      throw new Error("A stable SDK automation fire identity is required.");
    return {
      status:
        this.ledger.forKey(
          input.jobId,
          digest([input.jobId, input.idempotencyKey]),
        )?.status ?? "unsubmitted",
    };
  }
  async wait(
    caller: string,
    fireId: string,
    signal?: AbortSignal,
  ): Promise<{ text: string }> {
    this.authority(caller);
    if (!UUID.test(fireId)) throw new Error("Automation fire ID is invalid.");
    const fire = this.ledger.get(fireId);
    if (!fire) throw new Error("Automation fire not found.");
    const deadline = Date.now() + 9 * 60_000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const current = this.ledger.get(fireId);
      if (!current || ["cancelled", "error"].includes(current.status))
        throw new Error("Automation ended without an authorized result.");
      const state = (await this.bots.backendFor(fire.targetBotId)).getState();
      if (state.phase !== "ready" || !state.url)
        throw new Error(
          "The automation worker is unavailable. Its fire identity will not be replayed.",
        );
      const response = await this.runtimeFetch(
        `${state.url}/chat/runs/${encodeURIComponent(fire.runId)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (response.status === 404)
        throw new Error(
          "Automation submission is uncertain; inspect its saved run identity before creating a new fire.",
        );
      const receipt = await read(response);
      const run = receipt.run as Record<string, unknown> | undefined;
      if (run?.runId !== fire.runId || run.sessionId !== fire.sessionId)
        throw new Error("Automation runtime receipt is invalid.");
      if (run.status === "cancelled" || run.status === "error") {
        this.ledger.update(fireId, run.status);
        throw new Error("The automation run did not complete.");
      }
      if (run.status === "complete") {
        const transcript = await read(
          await this.runtimeFetch(
            `${state.url}/sessions/messages?sessionId=${encodeURIComponent(fire.sessionId)}&throughRunId=${encodeURIComponent(fire.runId)}&limit=500`,
            { signal: AbortSignal.timeout(10_000) },
          ),
        );
        const job = await this.job(fire.jobId);
        this.check(job, this.ledger.approval(fire.approvalId));
        await this.bots.validateAutomationConnection(fire.targetBotId);
        this.check(
          await this.job(fire.jobId),
          this.ledger.approval(fire.approvalId),
        );
        signal?.throwIfAborted();
        if (
          ["cancelled", "error"].includes(
            this.ledger.get(fireId)?.status ?? "error",
          )
        )
          throw new Error("Automation result arrived after cancellation.");
        if (
          transcript.throughRunId !== fire.runId ||
          !Array.isArray(transcript.messages)
        )
          throw new Error("Exact automation transcript is unavailable.");
        const assistant = [...transcript.messages]
          .reverse()
          .find(
            (row) =>
              row && row.role === "assistant" && typeof row.text === "string",
          );
        if (!assistant || assistant.text.length > 100_000)
          throw new Error(
            "The automation transcript has no valid exact result.",
          );
        this.ledger.update(fireId, "complete");
        return { text: assistant.text };
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      "Automation remains running; its saved run is preserved and will not be replayed.",
    );
  }
  async cancel(caller: string, fireId: string): Promise<void> {
    this.authority(caller);
    await this.cancelFire(fireId);
  }
  private async cancelFire(
    fireId: string,
    retryCancelled = false,
  ): Promise<void> {
    const fire = this.ledger.get(fireId);
    if (
      !fire ||
      (TERMINAL.has(fire.status) &&
        !(retryCancelled && fire.status === "cancelled"))
    )
      return;
    this.ledger.update(fireId, "cancelled");
    try {
      const state = (await this.bots.backendFor(fire.targetBotId)).getState();
      if (state.phase === "ready" && state.url)
        await this.runtimeFetch(
          `${state.url}/chat/runs/${encodeURIComponent(fire.runId)}/cancel`,
          { method: "POST", signal: AbortSignal.timeout(5_000) },
        );
    } catch {
      /* stop/recovery owns unavailable workers; intent remains cancelled */
    }
  }
  async cancelForBot(botId: string): Promise<void> {
    this.botGeneration.set(botId, (this.botGeneration.get(botId) ?? 0) + 1);
    if (this.storedLedger)
      await Promise.all(
        this.ledger
          .list()
          .filter(
            (fire) => fire.targetBotId === botId && !TERMINAL.has(fire.status),
          )
          .map((fire) => this.cancelFire(fire.fireId)),
      );
  }
  async cancelAll(): Promise<void> {
    this.cancelPendingValidations();
    if (this.storedLedger)
      await Promise.all(
        this.ledger
          .list()
          .filter((fire) => !TERMINAL.has(fire.status))
          .map((fire) => this.cancelFire(fire.fireId)),
      );
  }
}
