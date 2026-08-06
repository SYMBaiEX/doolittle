import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import {
  EventType,
  type IAgentRuntime,
  type IHookService,
  ServiceType,
} from "@elizaos/core";
import type { HookDefinition, HookInvocation } from "@/types";

interface HooksStore {
  hooks: HookDefinition[];
  invocations: HookInvocation[];
}

interface HookEventBinding {
  eventType: EventType;
  legacyEvent?: string;
}

const LEGACY_HOOK_EVENTS: Readonly<Record<string, EventType>> = {
  "agent:end": EventType.HOOK_AGENT_END,
  "gateway:shutdown": EventType.HOOK_GATEWAY_STOP,
  "gateway:startup": EventType.HOOK_GATEWAY_START,
  "session:expired": EventType.HOOK_SESSION_END,
  "session:start": EventType.HOOK_SESSION_START,
};

const OFFICIAL_HOOK_EVENTS = new Set<EventType>(
  Object.values(EventType).filter(
    (event): event is EventType =>
      typeof event === "string" && event.startsWith("HOOK_"),
  ),
);

function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/gu, (_, rawKey: string) => {
    const key = rawKey.trim();
    const value = payload[key];
    return value === undefined ? "" : String(value);
  });
}

export function resolveHookEventBinding(event: string): HookEventBinding {
  const normalized = event.trim();
  const officialEvent = normalized as EventType;
  if (OFFICIAL_HOOK_EVENTS.has(officialEvent)) {
    return { eventType: officialEvent };
  }
  const legacyEventType = LEGACY_HOOK_EVENTS[normalized];
  if (legacyEventType) {
    return { eventType: legacyEventType, legacyEvent: normalized };
  }
  throw new Error(
    `Unsupported hook event "${event}". Use an official HOOK_* event or a supported Doolittle legacy event.`,
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Durable projection for user-managed hooks.
 *
 * Eliza's HookService owns registration, enablement, eligibility, ordering, and
 * execution. This projection only persists user definitions and invocation
 * audit records, then bridges the legacy Doolittle event names into the
 * official HookService event lifecycle.
 */
export class HookProjectionService {
  private readonly filePath: string;
  private runtime?: IAgentRuntime;
  private nativeHooks?: IHookService;
  private readonly nativeRegistrations = new Map<string, string>();
  private readonly activeEmissions = new Map<string, HookInvocation[]>();

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "hooks.json");
    if (!existsSync(this.filePath)) {
      this.write({ hooks: [], invocations: [] });
    }
  }

  bindRuntime(runtime: IAgentRuntime): void {
    this.unregisterNativeHooks();
    const nativeHooks = runtime.getService<IHookService>(ServiceType.HOOKS);
    if (!nativeHooks) {
      throw new Error(
        `Required Eliza service ${ServiceType.HOOKS} is unavailable.`,
      );
    }
    this.runtime = runtime;
    this.nativeHooks = nativeHooks;
    for (const definition of this.list()) {
      this.registerNativeHook(definition);
    }
  }

  list(): HookDefinition[] {
    return this.read().hooks;
  }

  add(definition: Omit<HookDefinition, "id">): HookDefinition {
    resolveHookEventBinding(definition.event);
    const store = this.read();
    const hook: HookDefinition = {
      id: randomUUID(),
      ...definition,
      event: definition.event.trim(),
    };
    store.hooks.push(hook);
    this.write(store);
    this.registerNativeHook(hook);
    return hook;
  }

  remove(id: string): void {
    const registrationId = this.nativeRegistrations.get(id);
    if (registrationId) {
      this.nativeHooks?.unregister(registrationId);
      this.nativeRegistrations.delete(id);
    }
    const store = this.read();
    store.hooks = store.hooks.filter((hook) => hook.id !== id);
    this.write(store);
  }

  async emit(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<HookInvocation[]> {
    const runtime = this.runtime;
    if (!runtime) {
      throw new Error("Eliza runtime is not bound to the hook projection.");
    }
    const binding = resolveHookEventBinding(event);
    const emissionId = randomUUID();
    const invocations: HookInvocation[] = [];
    this.activeEmissions.set(emissionId, invocations);
    try {
      await runtime.emitEvent(
        binding.eventType,
        this.createNativePayload(runtime, event.trim(), payload, emissionId),
      );
      return [...invocations];
    } finally {
      this.activeEmissions.delete(emissionId);
    }
  }

  recentInvocations(limit = 25): HookInvocation[] {
    return this.read().invocations.slice(-limit).reverse();
  }

  private registerNativeHook(definition: HookDefinition): void {
    const nativeHooks = this.nativeHooks;
    if (!nativeHooks) {
      return;
    }
    let binding: HookEventBinding;
    try {
      binding = resolveHookEventBinding(definition.event);
    } catch {
      return;
    }
    const registrationId = nativeHooks.register(
      binding.eventType,
      async (nativePayload) => {
        const context =
          (
            nativePayload as typeof nativePayload & {
              context?: Record<string, unknown>;
            }
          ).context ?? {};
        const sourceEvent = stringValue(context.doolittleHookEvent);
        if (binding.legacyEvent && sourceEvent !== binding.legacyEvent) {
          return;
        }
        const payload =
          context.doolittleHookPayload &&
          typeof context.doolittleHookPayload === "object" &&
          !Array.isArray(context.doolittleHookPayload)
            ? (context.doolittleHookPayload as Record<string, unknown>)
            : context;
        const invocation: HookInvocation = {
          hookId: definition.id,
          event: sourceEvent ?? definition.event,
          payload,
          rendered: renderTemplate(definition.template, payload),
          createdAt: new Date().toISOString(),
        };
        this.recordInvocation(invocation);
        const emissionId = stringValue(context.doolittleHookEmissionId);
        if (emissionId) {
          this.activeEmissions.get(emissionId)?.push(invocation);
        }
      },
      {
        name: definition.name,
        description: `Doolittle managed hook ${definition.id}`,
        source: "managed",
        pluginId: "doolittle-runtime",
      },
    );
    this.nativeRegistrations.set(definition.id, registrationId);
    if (!definition.enabled) {
      nativeHooks.setEnabled(registrationId, false);
    }
  }

  private unregisterNativeHooks(): void {
    for (const registrationId of this.nativeRegistrations.values()) {
      this.nativeHooks?.unregister(registrationId);
    }
    this.nativeRegistrations.clear();
  }

  private createNativePayload(
    runtime: IAgentRuntime,
    event: string,
    payload: Record<string, unknown>,
    emissionId: string,
  ) {
    const sessionKey =
      stringValue(payload.sessionId) ??
      stringValue(payload.sessionKey) ??
      "doolittle";
    const context = {
      doolittleHookEmissionId: emissionId,
      doolittleHookEvent: event,
      doolittleHookPayload: payload,
    };
    const base = {
      runtime,
      sessionKey,
      messages: [] as string[],
      timestamp: new Date(),
      context,
    };
    const binding = resolveHookEventBinding(event);
    switch (binding.eventType) {
      case EventType.HOOK_GATEWAY_START:
      case EventType.HOOK_GATEWAY_STOP:
        return {
          ...base,
          host: stringValue(payload.host),
          port: numberValue(payload.port),
          channels: Array.isArray(payload.channels)
            ? payload.channels.filter(
                (value): value is string => typeof value === "string",
              )
            : stringValue(payload.platforms)?.split(",").filter(Boolean),
        };
      case EventType.HOOK_SESSION_START:
      case EventType.HOOK_SESSION_END:
        return {
          ...base,
          channelId: stringValue(payload.roomId),
          accountId: stringValue(payload.userId),
          conversationId: stringValue(payload.sessionId),
        };
      case EventType.HOOK_AGENT_START:
      case EventType.HOOK_AGENT_END:
        return {
          ...base,
          prompt: stringValue(payload.prompt),
          success:
            typeof payload.success === "boolean" ? payload.success : undefined,
          error: stringValue(payload.error),
          durationMs: numberValue(payload.durationMs),
        };
      default:
        return base;
    }
  }

  private recordInvocation(invocation: HookInvocation): void {
    const store = this.read();
    store.invocations.push(invocation);
    if (store.invocations.length > 200) {
      store.invocations = store.invocations.slice(-200);
    }
    this.write(store);
  }

  private read(): HooksStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as HooksStore;
  }

  private write(store: HooksStore): void {
    writeJsonAtomicSync(this.filePath, store);
  }
}
