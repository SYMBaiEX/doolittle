import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { HookDefinition, HookInvocation } from "@/types";

interface HooksStore {
  hooks: HookDefinition[];
  invocations: HookInvocation[];
}

function renderTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/gu, (_, rawKey: string) => {
    const key = rawKey.trim();
    const value = payload[key];
    return value === undefined ? "" : String(value);
  });
}

export class HooksService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "hooks.json");
    if (!existsSync(this.filePath)) {
      this.write({ hooks: [], invocations: [] });
    }
  }

  list(): HookDefinition[] {
    return this.read().hooks;
  }

  add(definition: Omit<HookDefinition, "id">): HookDefinition {
    const store = this.read();
    const hook: HookDefinition = {
      id: randomUUID(),
      ...definition,
    };
    store.hooks.push(hook);
    this.write(store);
    return hook;
  }

  remove(id: string): void {
    const store = this.read();
    store.hooks = store.hooks.filter((hook) => hook.id !== id);
    this.write(store);
  }

  async emit(event: string, payload: Record<string, unknown>): Promise<HookInvocation[]> {
    const store = this.read();
    const matches = store.hooks.filter((hook) => hook.enabled && hook.event === event);
    const invocations = matches.map((hook) => ({
      hookId: hook.id,
      event,
      payload,
      rendered: renderTemplate(hook.template, payload),
      createdAt: new Date().toISOString(),
    }));
    store.invocations.push(...invocations);
    if (store.invocations.length > 200) {
      store.invocations = store.invocations.slice(-200);
    }
    this.write(store);
    return invocations;
  }

  recentInvocations(limit = 25): HookInvocation[] {
    return this.read().invocations.slice(-limit).reverse();
  }

  private read(): HooksStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as HooksStore;
  }

  private write(store: HooksStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
