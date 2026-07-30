import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EventType,
  type HookHandler,
  type HookRegistrationOptions,
  type IAgentRuntime,
} from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  HookProjectionService,
  resolveHookEventBinding,
} from "./hook-projection-service";

interface NativeRegistration {
  enabled: boolean;
  event: EventType;
  handler: HookHandler;
}

class FakeNativeHookService {
  readonly registrations = new Map<string, NativeRegistration>();
  readonly unregistered: string[] = [];
  private nextId = 0;

  register(
    event: EventType,
    handler: HookHandler,
    _options: HookRegistrationOptions,
  ): string {
    const id = `native-${++this.nextId}`;
    this.registrations.set(id, { enabled: true, event, handler });
    return id;
  }

  unregister(id: string): boolean {
    this.unregistered.push(id);
    return this.registrations.delete(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const registration = this.registrations.get(id);
    if (registration) registration.enabled = enabled;
  }

  async dispatch(event: EventType, payload: never): Promise<void> {
    for (const registration of this.registrations.values()) {
      if (registration.enabled && registration.event === event) {
        await registration.handler(payload);
      }
    }
  }
}

function createRuntime(nativeHooks: FakeNativeHookService): IAgentRuntime {
  const runtime = {
    getService() {
      return nativeHooks;
    },
    async emitEvent(event: EventType, payload: never) {
      await nativeHooks.dispatch(event, payload);
    },
  };
  return runtime as unknown as IAgentRuntime;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createProjection() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-hook-projection-"));
  roots.push(root);
  return new HookProjectionService(root);
}

describe("HookProjectionService", () => {
  it("delegates legacy event matching and execution to Eliza HookService", async () => {
    const nativeHooks = new FakeNativeHookService();
    const projection = createProjection();
    projection.bindRuntime(createRuntime(nativeHooks));

    const hook = projection.add({
      event: "session:start",
      name: "welcome",
      enabled: true,
      template: "Session {{sessionId}} started for {{userId}}",
    });

    expect([...nativeHooks.registrations.values()][0]?.event).toBe(
      EventType.HOOK_SESSION_START,
    );

    const invocations = await projection.emit("session:start", {
      sessionId: "session-1",
      userId: "user-1",
    });

    expect(invocations).toEqual([
      expect.objectContaining({
        hookId: hook.id,
        event: "session:start",
        rendered: "Session session-1 started for user-1",
      }),
    ]);
    expect(projection.recentInvocations()).toEqual(invocations);

    projection.remove(hook.id);
    expect(nativeHooks.registrations.size).toBe(0);
    expect(nativeHooks.unregistered).toEqual(["native-1"]);
  });

  it("uses native enablement and hydrates persisted definitions on bind", () => {
    const projection = createProjection();
    const disabled = projection.add({
      event: EventType.HOOK_AGENT_END,
      name: "disabled audit",
      enabled: false,
      template: "{{error}}",
    });
    const nativeHooks = new FakeNativeHookService();

    projection.bindRuntime(createRuntime(nativeHooks));

    expect(projection.list()).toEqual([disabled]);
    expect([...nativeHooks.registrations.values()]).toEqual([
      expect.objectContaining({
        enabled: false,
        event: EventType.HOOK_AGENT_END,
      }),
    ]);
  });

  it("rejects events outside the official lifecycle and supported aliases", async () => {
    const projection = createProjection();
    projection.bindRuntime(createRuntime(new FakeNativeHookService()));

    expect(() => resolveHookEventBinding("made:up")).toThrow(
      'Unsupported hook event "made:up"',
    );
    expect(() =>
      projection.add({
        event: "made:up",
        name: "invalid",
        enabled: true,
        template: "invalid",
      }),
    ).toThrow("Unsupported hook event");
    await expect(projection.emit("made:up", {})).rejects.toThrow(
      "Unsupported hook event",
    );
  });

  it("does not silently execute without the Eliza runtime", async () => {
    const projection = createProjection();

    await expect(projection.emit("session:start", {})).rejects.toThrow(
      "Eliza runtime is not bound",
    );
  });
});
