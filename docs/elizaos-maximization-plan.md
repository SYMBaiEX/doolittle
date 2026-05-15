# ElizaOS Runtime Maximization Plan

> Generated from analysis of `@elizaos/core` runtime, `@elizaos/autonomous`, and installed plugin ecosystem.
> Date: 2026-03-23

---

## Critical Priority (Enable Immediately)

### 1. AwarenessRegistry from @elizaos/autonomous (Self-Awareness Injection)

**What it is:** A two-layer self-awareness system that composes summaries (Layer 1) and provides on-demand detail retrieval (Layer 2) for the agent. Individual awareness contributors register modules (e.g., system status, memory state, world context) and the registry orchestrates them into a unified self-awareness prompt segment. Fault-tolerant by design -- contributor errors surface as `[{id}: unavailable]` markers, never thrown exceptions.

**Where it lives:**
- `@elizaos/autonomous/packages/autonomous/src/awareness/registry.ts`
- Exported classes: `AwarenessRegistry`, `setGlobalAwarenessRegistry`, `getGlobalAwarenessRegistry`
- Contributor contract: `@elizaos/autonomous/packages/autonomous/src/contracts/awareness.ts` (`AwarenessContributor`, `AwarenessInvalidationEvent`)

**Code changes needed:**
1. Import and instantiate `AwarenessRegistry` at agent startup.
2. Call `setGlobalAwarenessRegistry(registry)` so all subsystems can access it.
3. Register awareness contributors for key modules:
   - System health / uptime
   - Active task inventory
   - Relationship graph summary
   - Memory utilization stats
   - Active trigger count
4. Wire `registry.composeSummary(runtime)` output into the system prompt or a provider that injects the awareness block.
5. Call `registry.invalidate(event)` when state changes (task completion, new relationship, etc.) to bust the cache.

**Expected impact:** The agent gains persistent self-knowledge of its own state, capabilities, and operational context. This enables metacognitive reasoning -- "I have 3 pending tasks, my last research took 12 minutes, I have a strong relationship with entity X" -- which dramatically improves autonomous decision-making quality.

---

### 2. Four Core Evaluators (Reflection, Relationships, Long-Term Memory, Summarization)

**What they are:** Post-response evaluators that run after the agent generates a reply, extracting structured knowledge from conversations.

| Evaluator | Source | Purpose |
|---|---|---|
| `reflectionEvaluator` | `@elizaos/plugin-bootstrap` (built-in) | Extracts facts and relationship updates from conversation via XML parsing. Updates entity components and relationship graph. |
| `longTermExtractionEvaluator` | `@elizaos/core/dist/advanced-memory` | Extracts episodic, semantic, and procedural long-term memories with confidence scoring. Categories: `EPISODIC`, `SEMANTIC`, `PROCEDURAL`. |
| `summarizationEvaluator` | `@elizaos/core/dist/advanced-memory` | Creates session summaries when message count exceeds threshold. Produces topic lists, key points, and embedding-ready summaries. |
| (relationship management) | Via `reflectionEvaluator` | Creates/updates `Relationship` objects with `sourceEntityId`, `targetEntityId`, tags, and metadata. |

**Where they live:**
- Reflection: bundled in `@elizaos/plugin-bootstrap/dist/index.js` (line ~5102)
- Long-term + Summarization: `@elizaos/core/dist/advanced-memory/evaluators/`
- Advanced memory plugin factory: `createAdvancedMemoryPlugin()` from `@elizaos/core/dist/advanced-memory/index`

**Code changes needed:**
1. Ensure `@elizaos/plugin-bootstrap` is registered (likely already is -- verify reflection evaluator is in `runtime.evaluators`).
2. Call `createAdvancedMemoryPlugin()` and register it via `runtime.registerPlugin()`.
3. Configure memory thresholds in character settings:
   ```json
   {
     "shortTermSummarizationThreshold": 20,
     "shortTermRetainRecent": 5,
     "longTermExtractionEnabled": true,
     "longTermVectorSearchEnabled": true,
     "longTermConfidenceThreshold": 0.7,
     "longTermExtractionThreshold": 10,
     "longTermExtractionInterval": 5
   }
   ```
4. Ensure a `MemoryStorageProvider` is available via `runtime.getService("memoryStorage")` (provided by the SQL plugin if using PostgreSQL/SQLite).

**Expected impact:** The agent develops persistent memory across sessions. Facts extracted from conversations become queryable knowledge. Session summaries prevent context window bloat while preserving key information. Relationship tracking enables socially-aware responses.

---

### 3. RESEARCH Model Type (o3-deep-research with Web Search, File Search, Code Interpreter)

**What it is:** A first-class model type (`ModelType.RESEARCH`) that maps to OpenAI's deep research models (`o3-deep-research`, `o4-mini-deep-research`). These models can autonomously search the web, analyze files in vector stores, execute code, and connect to remote MCP servers to produce comprehensive research reports with inline citations.

**Where it lives:**
- Type definitions: `@elizaos/core/dist/types/model.d.ts` -- `ResearchParams`, `ResearchResult`, `ResearchTool`, `ResearchAnnotation`
- Model registration: via `runtime.registerModel(ModelType.RESEARCH, handler, provider)`
- Plugin implementation: `@elizaos/plugin-openai` (must register the RESEARCH handler)

**Code changes needed:**
1. Ensure `@elizaos/plugin-openai` is loaded and has registered a handler for `ModelType.RESEARCH`.
2. Create a research action or integrate into existing actions:
   ```typescript
   const result = await runtime.useModel(ModelType.RESEARCH, {
     input: "Research question here",
     tools: [
       { type: "web_search_preview" },
       { type: "code_interpreter", container: { type: "auto" } }
     ],
     background: true, // recommended for long tasks
     model: "o3-deep-research",
     reasoningSummary: "auto",
   });
   ```
3. Handle `ResearchResult` with its annotations array for source attribution.
4. For vector store search, pre-create OpenAI vector stores and reference them:
   ```typescript
   { type: "file_search", vectorStoreIds: ["vs_abc123"] }
   ```
5. For MCP integration:
   ```typescript
   { type: "mcp", serverLabel: "internal-docs", serverUrl: "https://...", requireApproval: "never" }
   ```

**Expected impact:** The agent can perform deep, multi-source research tasks that take minutes, producing cited reports. This is transformative for knowledge work -- competitive analysis, technical research, regulatory review -- with full source traceability.

---

### 4. TEXT_REASONING Models for Complex Planning Tasks

**What it is:** Two reasoning model tiers (`TEXT_REASONING_SMALL` / `TEXT_REASONING_LARGE`) designed for chain-of-thought reasoning on complex tasks. These map to models like o3-mini and o3 that excel at multi-step planning, code generation, and logical deduction.

**Where it lives:**
- Constants: `ModelType.TEXT_REASONING_SMALL` ("REASONING_SMALL"), `ModelType.TEXT_REASONING_LARGE` ("REASONING_LARGE")
- Settings: `TEXT_REASONING_SMALL_TEMPERATURE`, `TEXT_REASONING_LARGE_MAX_TOKENS`, etc.
- Advanced planning plugin: `@elizaos/core/dist/advanced-planning/` -- `createAdvancedPlanningPlugin()`, `PlanningService`

**Code changes needed:**
1. Register reasoning model handlers via `@elizaos/plugin-openai` or `@elizaos/plugin-anthropic`.
2. Register the advanced planning plugin:
   ```typescript
   import { createAdvancedPlanningPlugin } from "@elizaos/core/dist/advanced-planning";
   await runtime.registerPlugin(createAdvancedPlanningPlugin());
   ```
3. Use reasoning models for complex tasks:
   ```typescript
   const plan = await runtime.useModel(ModelType.TEXT_REASONING_LARGE, {
     prompt: complexPlanningPrompt,
     maxTokens: 8192,
   });
   ```
4. Configure per-model settings in character:
   ```json
   {
     "TEXT_REASONING_LARGE_TEMPERATURE": 0.1,
     "TEXT_REASONING_LARGE_MAX_TOKENS": 8192,
     "TEXT_REASONING_SMALL_TEMPERATURE": 0.3
   }
   ```
5. Route planning-heavy tasks through the `PlanningService` for structured multi-step execution.

**Expected impact:** Complex tasks that currently fail or produce shallow results will benefit from dedicated reasoning models. Multi-step action plans (`ActionPlan` with `ActionPlanStep[]`) become reliable. The planning service provides structured decomposition and tracking.

---

## High Priority (Next Sprint)

### 5. AgentEventService Streams for TUI Real-Time Observability

**What it is:** A centralized event streaming service (`ServiceType.AGENT_EVENT`) that provides real-time observability into agent activity. Supports 10+ event stream categories: `lifecycle`, `tool`, `assistant`, `error`, `heartbeat`, `message`, `action`, `evaluator`, `provider`, `memory`. Each event carries a monotonic sequence number, timestamp, run ID, and session routing key.

**Where it lives:**
- Service: `@elizaos/core/dist/services/agentEvent.d.ts` -- `AgentEventService`
- Types: `@elizaos/core/dist/types/agentEvent.d.ts` -- all payload interfaces
- Access: `runtime.getService(ServiceType.AGENT_EVENT) as AgentEventService`

**Code changes needed:**
1. Ensure `AgentEventService` is registered (may auto-register; verify with `runtime.hasService("agent_event")`).
2. Subscribe to event streams for TUI display:
   ```typescript
   const eventService = runtime.getService(ServiceType.AGENT_EVENT) as AgentEventService;
   const unsub = eventService.subscribe((event) => {
     // Route to TUI panel based on event.stream
     switch (event.stream) {
       case "lifecycle": renderLifecyclePanel(event); break;
       case "tool": renderToolPanel(event); break;
       case "action": renderActionPanel(event); break;
       // ...
     }
   });
   ```
3. Register run contexts for session routing:
   ```typescript
   eventService.registerRunContext(runId, {
     sessionKey: "tui-session",
     verboseLevel: "verbose",
   });
   ```
4. Subscribe to heartbeats for health indicator:
   ```typescript
   eventService.subscribeHeartbeat((hb) => {
     updateStatusIndicator(resolveHeartbeatIndicator(hb.status));
   });
   ```

**Expected impact:** Full real-time visibility into agent internals. Every provider call, LLM invocation, action execution, and memory operation becomes observable. Essential for debugging, performance tuning, and building operational dashboards.

---

### 6. Trajectory Persistence from @elizaos/core

**What it is:** The canonical ElizaOS trace capture system for benchmarking and training data generation. Captures provider accesses (what data was fetched and why) and LLM calls (full prompt/response pairs with latency) during execution steps. Uses `AsyncLocalStorage` for async-safe propagation.

**Where it lives in the installed SDK:**
- Service: `@elizaos/core` / `TrajectoriesService` -- SQL-backed service registered as `trajectories`
- Context: `@elizaos/core/dist/trajectory-context.d.ts` -- `TrajectoryContext`, `runWithTrajectoryContext`
- Export API: `TrajectoriesService.exportTrajectories({ format, includePrompts, trajectoryIds, startDate, endDate, scenarioId, batchId })`

**Code changes needed:**
1. Resolve the SDK service via `TrajectoriesService.resolveFromRuntime(runtime)` or `resolveTrajectoryLogger(runtime)` rather than writing a parallel training format.
2. Wrap execution steps with trajectory context:
   ```typescript
   import { runWithTrajectoryContext } from "@elizaos/core";
   await runWithTrajectoryContext({ trajectoryStepId: "step-001" }, async () => {
     // All provider accesses and LLM calls within this scope are captured
     await runtime.composeState(message);
     await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
   });
   ```
3. Export model-training data through the SDK only:
   ```typescript
   const trajectories = TrajectoriesService.resolveFromRuntime(runtime);
   await trajectories?.exportTrajectories({
     format: "json",
     includePrompts: true,
   });
   ```

Doolittle debug bundles remain useful for replay, analysis, and operator troubleshooting. They are explicitly labeled `trainingCompatible:false` and are not a fallback for `/trajectories export`.

**Expected impact:** Complete execution traces for every agent interaction. Enables: benchmark comparison across model/prompt changes, training data extraction for fine-tuning, cost analysis per interaction, and regression detection.

---

### 7. Task Management System (registerTaskWorker, createTask)

**What it is:** A full task scheduling and execution framework with recurring tasks, failure handling, backoff, and auto-pause. Tasks are database-persisted and survive restarts. The `TaskService` supports both local timers and a batched daemon scheduler for multi-agent deployments.

**Where it lives:**
- Types: `@elizaos/core/dist/types/task.d.ts` -- `Task`, `TaskWorker`, `TaskMetadata`, `TaskRunStatus`
- Scheduler: `@elizaos/core/dist/services/task-scheduler.d.ts` -- batched multi-runtime scheduler
- Runtime API: `runtime.registerTaskWorker()`, `runtime.createTask()`, `runtime.getTask()`, `runtime.updateTask()`

**Code changes needed:**
1. Define and register task workers:
   ```typescript
   runtime.registerTaskWorker({
     name: "DAILY_REPORT",
     execute: async (runtime, options, task) => {
       // Generate daily report
       return { nextInterval: 24 * 60 * 60 * 1000 }; // dynamic interval
     },
     shouldRun: async (runtime, task) => {
       // Check if report is needed
       return !task.metadata?.lastExecuted || isOverdue(task);
     },
   });
   ```
2. Create tasks:
   ```typescript
   const taskId = await runtime.createTask({
     name: "DAILY_REPORT",
     roomId,
     metadata: {
       updateInterval: 86400000, // 24h
       blocking: true,
       maxFailures: 3,
       priority: "high",
     },
     tags: ["repeat", "reporting"],
   });
   ```
3. For multi-agent deployments, use the daemon scheduler:
   ```typescript
   import { startTaskScheduler } from "@elizaos/core";
   startTaskScheduler(databaseAdapter); // One timer for all runtimes
   ```

**Expected impact:** Reliable background task execution with auto-retry, backoff, and health monitoring. Enables scheduled reports, periodic data sync, maintenance routines, and any recurring autonomous work.

---

### 8. Relationship Management APIs

**What it is:** First-class relationship tracking between entities with tags, metadata, and bidirectional querying. The `reflectionEvaluator` automatically creates/updates relationships from conversation analysis.

**Where it lives:**
- Types: `@elizaos/core/dist/types/environment.d.ts` -- `Relationship` (extends `ProtoRelationship`)
- Runtime API: `runtime.createRelationship()`, `runtime.updateRelationship()`
- Evaluator: `reflectionEvaluator` in `@elizaos/plugin-bootstrap` auto-extracts relationships

**Code changes needed:**
1. Ensure reflection evaluator is active (comes with bootstrap plugin).
2. Programmatically create relationships for known entities:
   ```typescript
   await runtime.createRelationship({
     sourceEntityId: agentEntityId,
     targetEntityId: userEntityId,
     tags: ["collaborator", "admin"],
     metadata: { trustLevel: "high", firstInteraction: Date.now() },
   });
   ```
3. Query relationships via database adapter for context enrichment.
4. Wire relationship data into awareness contributors for the AwarenessRegistry.

**Expected impact:** The agent maintains a social graph. It knows who it's talked to, the nature of those relationships, and can adapt its behavior accordingly. Combined with the reflection evaluator, this becomes automatic.

---

### 9. OBJECT_SMALL / OBJECT_LARGE for Structured Generation

**What it is:** Dedicated model types for generating validated JSON objects from schemas. Unlike text models that require post-hoc parsing, these use native structured output (JSON mode) for reliable structured data generation.

**Where it lives:**
- Constants: `ModelType.OBJECT_SMALL`, `ModelType.OBJECT_LARGE`
- Params: `ObjectGenerationParams` with `schema: JSONSchema`, `enumValues`, `stopSequences`
- Settings: `OBJECT_SMALL_TEMPERATURE`, `OBJECT_LARGE_MAX_TOKENS`, etc.
- Result: `Record<string, JsonValue>` (typed object)

**Code changes needed:**
1. Verify handlers are registered for both model types (via OpenAI/Anthropic plugin).
2. Replace text-generation-then-parse patterns with structured generation:
   ```typescript
   const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
     prompt: "Extract the user's intent from this message: ...",
     schema: {
       type: "object",
       properties: {
         intent: { type: "string", enum: ["question", "command", "chat"] },
         entities: { type: "array", items: { type: "string" } },
         confidence: { type: "number" },
       },
       required: ["intent", "confidence"],
     },
     temperature: 0.1,
   });
   // result is typed: { intent: string, entities: string[], confidence: number }
   ```
3. Configure per-type settings for reliability:
   ```json
   {
     "OBJECT_SMALL_TEMPERATURE": 0.1,
     "OBJECT_SMALL_MAX_TOKENS": 2048,
     "OBJECT_LARGE_TEMPERATURE": 0.2
   }
   ```

**Expected impact:** Eliminates JSON parsing failures that plague text-based extraction. Structured outputs are guaranteed valid against the schema. Reduces retry loops and improves action parameter extraction reliability.

---

### 10. Prompt Segment Caching for Performance

**What it is:** A system for marking prompt segments as stable vs. unstable, enabling provider-level prompt caching (Anthropic `cache_control`, OpenAI prefix caching, Gemini context caching). Stable segments (instructions, format, examples) are cached; per-call content (state, UUIDs) is marked unstable.

**Where it lives:**
- Type: `PromptSegment` in `@elizaos/core/dist/types/model.d.ts` -- `{ content: string, stable: boolean }`
- Usage: `GenerateTextParams.promptSegments` -- optional ordered segments
- Invariant: `prompt === promptSegments.map(s => s.content).join("")`

**Code changes needed:**
1. Refactor prompt construction to use segments:
   ```typescript
   const systemInstructions = "You are an agent that..."; // stable
   const stateContext = composeStateText(state); // unstable

   await runtime.useModel(ModelType.TEXT_LARGE, {
     prompt: systemInstructions + stateContext,
     promptSegments: [
       { content: systemInstructions, stable: true },
       { content: stateContext, stable: false },
     ],
   });
   ```
2. Mark character description, action descriptions, and format instructions as `stable: true`.
3. Mark conversation history, recent memories, and state values as `stable: false`.
4. Ensure the model provider plugin respects `promptSegments` (Anthropic plugin likely does).

**Expected impact:** 50-90% reduction in prompt token costs for repeated interactions with the same character/schema. Faster time-to-first-token due to cache hits. Most impactful for Anthropic models where cache_control is explicitly supported.

---

## Medium Priority (Planned)

### 11. Trigger System from @elizaos/autonomous

**What it is:** A time-based task execution system supporting `interval`, `once`, and `cron` trigger types. Triggers wrap tasks with scheduling metadata and support two wake modes: `inject_now` (immediate execution) and `next_autonomy_cycle` (batched with next autonomous think).

**Where it lives:**
- Types: `@elizaos/autonomous/packages/autonomous/src/triggers/types.ts` -- `TriggerConfig`, `TriggerRunRecord`, `TriggerSummary`, `TriggerHealthSnapshot`
- Runtime: `@elizaos/autonomous/packages/autonomous/src/triggers/runtime.ts` -- `registerTriggerTaskWorker()`, `listTriggerTasks()`, `executeTriggerTask()`, `getTriggerHealthSnapshot()`
- Action: `@elizaos/autonomous/packages/autonomous/src/triggers/action.ts` -- user-facing trigger CRUD

**Code changes needed:**
1. Call `registerTriggerTaskWorker(runtime)` at startup.
2. Ensure `triggersFeatureEnabled(runtime)` returns `true` (check settings).
3. Create triggers programmatically or via the trigger action:
   ```typescript
   // Cron trigger for daily check
   await runtime.createTask({
     name: "TRIGGER_DISPATCH",
     tags: ["queue", "repeat", "trigger"],
     metadata: {
       trigger: {
         version: 1,
         triggerId: generateUUID(),
         displayName: "Daily Market Check",
         instructions: "Check market conditions and report anomalies",
         triggerType: "cron",
         cronExpression: "0 9 * * *",
         enabled: true,
         wakeMode: "inject_now",
         createdBy: "system",
         runCount: 0,
       },
     },
   });
   ```
4. Monitor health: `getTriggerHealthSnapshot(runtime)` returns active/disabled counts, execution stats.

**Expected impact:** Time-based autonomous actions without external cron infrastructure. Agents can schedule their own recurring tasks, one-time reminders, and periodic checks. Combined with the autonomy service, this creates a fully self-scheduling agent.

---

### 12. Sandbox Execution (E2B Integration)

**What it is:** Secure code execution in sandboxed containers via E2B or a compatible local sandbox. Doolittle currently exposes an E2B-compatible local sandbox through `@doolittle/plugin-local-sandbox`, consolidated inside `doolittle-plugin`, while the upstream E2B package remains a future replacement candidate.

**Where it lives:**
- Doolittle adapter: `packages/plugins/doolittle-plugin/local-sandbox`
- Research integration: `ResearchCodeInterpreterTool` in model types (`{ type: "code_interpreter", container: { type: "auto" } }`)

**Code changes needed:**
1. Configure E2B API credentials in environment/settings.
2. Register the E2B plugin: `await runtime.registerPlugin(e2bPlugin)`.
3. Use sandbox execution for code generated by the agent, especially in research workflows.
4. Integrate with the RESEARCH model type's code interpreter tool.

**Expected impact:** Safe execution of agent-generated code. Prevents filesystem/network damage from hallucinated scripts. Essential for research tasks involving data analysis and code generation.

---

### 13. Heartbeat System

**What it is:** An autonomous heartbeat mechanism that periodically sends status signals to monitored channels. Supports multiple status types (`sent`, `ok-empty`, `ok-token`, `skipped`, `failed`) with UI indicator mapping (`ok`, `alert`, `error`).

**Where it lives:**
- Types: `@elizaos/core/dist/types/agentEvent.d.ts` -- `HeartbeatEventPayload`, `HeartbeatStatus`, `HeartbeatIndicatorType`
- Service: `AgentEventService.emitHeartbeat()`, `subscribeHeartbeat()`
- Resolver: `resolveHeartbeatIndicator(status)` maps status to UI indicator

**Code changes needed:**
1. Implement a heartbeat task worker that periodically checks agent health.
2. Emit heartbeats through the AgentEventService:
   ```typescript
   eventService.emitHeartbeat({
     status: "ok-token",
     to: "admin-channel",
     preview: "Agent operational, 3 tasks pending",
     channel: "telegram",
     indicatorType: "ok",
   });
   ```
3. Subscribe in TUI/dashboard for real-time health display.
4. Configure heartbeat intervals and failure thresholds.

**Expected impact:** Continuous health monitoring. Operators know immediately when an agent goes silent, encounters errors, or degrades. The indicator system (`ok`/`alert`/`error`) provides at-a-glance status.

---

### 14. HOOK_TOOL_BEFORE / HOOK_TOOL_AFTER for Approval Flows

**What it is:** Hook events that fire before and after tool/action execution, enabling interception, modification, and approval workflows. `HOOK_TOOL_BEFORE` can skip execution (`skip: true`) or modify arguments (`modifiedArgs`). `HOOK_TOOL_AFTER` can modify results. `HOOK_TOOL_PERSIST` controls what gets stored.

**Where it lives:**
- Events: `EventType.HOOK_TOOL_BEFORE`, `EventType.HOOK_TOOL_AFTER`, `EventType.HOOK_TOOL_PERSIST`
- Payload: `HookToolPayload` -- `toolName`, `toolArgs`, `result`, `skip`, `modifiedArgs`, `modifiedResult`
- Hook Service: `IHookService` via `ServiceType.HOOKS`
- Approval Service: `ServiceType.APPROVAL` in service registry

**Code changes needed:**
1. Register hooks via the HookService:
   ```typescript
   const hookService = runtime.getService(ServiceType.HOOKS) as IHookService;
   hookService.register(
     [EventType.HOOK_TOOL_BEFORE],
     async (payload: HookToolPayload) => {
       if (payload.toolName === "transfer_funds" && needsApproval(payload.toolArgs)) {
         payload.skip = true;
         payload.messages.push("Transfer requires admin approval. Queued for review.");
       }
     },
     { name: "approval-gate", priority: 100, source: "runtime" }
   );
   ```
2. Implement an approval queue backed by tasks:
   ```typescript
   hookService.register(
     [EventType.HOOK_TOOL_AFTER],
     async (payload: HookToolPayload) => {
       await auditLog(payload.toolName, payload.toolArgs, payload.result);
     },
     { name: "audit-logger", source: "runtime" }
   );
   ```
3. Use `HOOK_TOOL_PERSIST` to filter sensitive data from storage.

**Expected impact:** Human-in-the-loop safety for high-stakes actions. Financial transfers, external API calls, and data modifications can require explicit approval before execution. Full audit trail via the after-hook.

---

### 15. Skill / MCP Marketplace Integration

**What it is:** Integration with the MCP (Model Context Protocol) ecosystem and the ElizaOS skills marketplace through the installed ElizaOS package surface. Doolittle should prefer exported SDK helpers from `@elizaos/autonomous` and `@elizaos/agent`, plus native skill manifests from `@elizaos/skills`, instead of importing unavailable top-level plugin packages directly.

**Where it lives:**
- MCP marketplace helpers: `@elizaos/autonomous/services/mcp-marketplace`
- Skill marketplace helpers: `@elizaos/autonomous/services/skill-marketplace`
- Agent registry and skill catalog clients: `@elizaos/agent/services/registry-client`, `@elizaos/agent/services/skill-catalog-client`
- Native skill file parsing and serialization: `@elizaos/skills`
- Doolittle MCP execution adapter: `packages/agent/src/services/mcp/`
- Doolittle skills hub: `packages/agent/src/services/skills-hub/`
- Research MCP: `ResearchMcpTool` type for deep research integration

**Code changes needed:**
1. Keep local and generated skills in canonical `@elizaos/skills` frontmatter so Doolittle skill data stays portable.
2. Use `@elizaos/autonomous/services/mcp-marketplace` for marketplace search, details, and config generation.
3. Use `@elizaos/autonomous/services/skill-marketplace` and `@elizaos/agent` catalog clients for marketplace/catalog discovery instead of local scraping.
4. Keep Doolittle's local MCP execution service as the product adapter until an official MCP execution plugin is promoted to a direct top-level dependency.
5. Integrate MCP tools with the RESEARCH model type for deep research across internal knowledge bases.

**Expected impact:** Extensible agent capabilities without code deployment. New tools, APIs, and knowledge sources can be connected at runtime via MCP. The skills marketplace enables community-contributed capabilities.

---

### 16. dynamicPromptExecFromState Validation System

**What it is:** A sophisticated prompt execution system with built-in validation codes, schema-based parsing, streaming support, and performance tracking. Uses UUID codes injected into prompts that the LLM must echo back -- if codes match, the LLM actually read and followed the prompt. Four validation levels from "trusted" (no codes) to "full" (start + end codes).

**Where it lives:**
- Runtime method: `runtime.dynamicPromptExecFromState(args)`
- Schema: `SchemaRow[]` from `@elizaos/core/dist/types/state.d.ts`
- Options: `contextCheckLevel` (0-3), `maxRetries`, `retryBackoff`, `preferredEncapsulation` (json/xml)

**Code changes needed:**
1. Define schemas for structured responses:
   ```typescript
   const schema: SchemaRow[] = [
     { name: "sentiment", type: "string", description: "positive/negative/neutral" },
     { name: "confidence", type: "number", description: "0.0 to 1.0" },
     { name: "reasoning", type: "string", description: "Why this sentiment" },
   ];
   ```
2. Execute with validation:
   ```typescript
   const result = await runtime.dynamicPromptExecFromState({
     state: currentState,
     params: { prompt: "Analyze sentiment of: {{recentMessages}}" },
     schema,
     options: {
       contextCheckLevel: 2, // Default: codes at start
       modelSize: "small",
       maxRetries: 2,
       onStreamChunk: (chunk) => streamToClient(chunk),
     },
   });
   ```
3. Use level 3 (full validation) for critical operations where truncation detection matters.
4. Use level 0 for high-throughput, trusted model calls.

**Expected impact:** Reliable structured LLM outputs with truncation detection. Eliminates silent failures where the LLM ignores parts of the prompt. Performance tracking per model+schema combination enables data-driven model selection.

---

### 17. Advanced Sampling Controls

**What it is:** Per-model-type configuration of all sampling parameters: temperature, top_p, top_k, min_p, seed, repetition_penalty, frequency_penalty, presence_penalty. Supports three-tier precedence: direct params > model-specific settings > default settings.

**Where it lives:**
- Constants: `MODEL_SETTINGS` in `@elizaos/core/dist/types/model.d.ts` -- 90+ setting keys
- Character settings: `DEFAULT_TEMPERATURE`, `TEXT_SMALL_TEMPERATURE`, `OBJECT_LARGE_TOP_P`, etc.
- LLM Mode: `LLMMode.DEFAULT | SMALL | LARGE` for global model override

**Code changes needed:**
1. Configure character settings for optimal sampling per model type:
   ```json
   {
     "DEFAULT_TEMPERATURE": 0.7,
     "TEXT_SMALL_TEMPERATURE": 0.5,
     "TEXT_LARGE_TEMPERATURE": 0.7,
     "OBJECT_SMALL_TEMPERATURE": 0.1,
     "OBJECT_LARGE_TEMPERATURE": 0.2,
     "TEXT_REASONING_SMALL_TEMPERATURE": 0.1,
     "TEXT_REASONING_LARGE_TEMPERATURE": 0.1,
     "DEFAULT_MAX_TOKENS": 4096,
     "TEXT_LARGE_MAX_TOKENS": 8192,
     "TEXT_REASONING_LARGE_MAX_TOKENS": 16384,
     "DEFAULT_FREQUENCY_PENALTY": 0.1,
     "DEFAULT_PRESENCE_PENALTY": 0.1
   }
   ```
2. Use `LLMMode` for cost management:
   ```typescript
   // Force all calls to use TEXT_SMALL for cost optimization
   const runtime = new AgentRuntime({ character, llmMode: LLMMode.SMALL });
   ```
3. Override per-call when needed (highest precedence):
   ```typescript
   await runtime.useModel(ModelType.TEXT_LARGE, {
     prompt,
     temperature: 0.0, // Overrides character settings
     seed: 42, // Deterministic output
   });
   ```

**Expected impact:** Fine-grained control over output quality, creativity, and cost. Reasoning models get low temperature for determinism. Object generation gets minimal temperature for schema compliance. Creative tasks get higher temperature. Seed support enables reproducible outputs for testing.

---

## Implementation Roadmap Summary

| Phase | Items | Effort (days) | Key Dependency |
|---|---|---|---|
| **Critical** | AwarenessRegistry, 4 Evaluators, RESEARCH model, TEXT_REASONING | 5-7 | OpenAI API key for RESEARCH, MemoryStorageProvider for evaluators |
| **High** | AgentEventService, Trajectories, Tasks, Relationships, OBJECT models, Prompt caching | 7-10 | Database adapter for task persistence |
| **Medium** | Triggers, Sandbox, Heartbeat, Tool hooks, MCP/Skills, Validation, Sampling | 10-14 | E2B API key for sandbox, MCP servers configured |

## Architecture Notes

- **PromptBatcher integration:** The autonomy service uses the prompt batcher (Option A) rather than task-based scheduling. The batcher's `minCycleMs` and background tick control autonomy timing.
- **Service discovery:** All services are accessed via `runtime.getService(ServiceType.X)`. Check availability with `runtime.hasService()` before use.
- **Plugin registration order matters:** Bootstrap plugin should load first (provides reflection evaluator), then model provider plugins, then advanced memory/planning.
- **Batched task scheduler:** For multi-agent deployments, `startTaskScheduler(adapter)` creates one timer for all runtimes instead of N timers doing N `getTasks()` calls.
- **Event system is dual-layer:** `EventType` enum events go through `runtime.emitEvent()` / `runtime.registerEvent()`. Agent events go through `AgentEventService.emit()` / `subscribe()`. They serve different purposes -- system lifecycle vs. observability.
