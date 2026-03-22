import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

interface StoredFormRecord {
  id: string;
  templateId: string;
  status: "active" | "completed" | "cancelled";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface FormsStore {
  forms: StoredFormRecord[];
}

const DEFAULT_TEMPLATES = {
  project_scaffold: {
    id: "project_scaffold",
    name: "Project Scaffold",
    description: "Collects the project name, scope, APIs, and outcomes.",
    fields: [
      "projectName",
      "description",
      "apis",
      "requirements",
      "deliverables",
    ],
  },
  research_brief: {
    id: "research_brief",
    name: "Research Brief",
    description: "Captures a research request for benchmark and analysis work.",
    fields: ["title", "objective", "constraints", "sources"],
  },
  release_readiness: {
    id: "release_readiness",
    name: "Release Readiness",
    description: "Tracks rollout, QA, and launch gating decisions.",
    fields: ["releaseName", "checks", "risks", "owner"],
  },
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class FormsService extends ElizaService {
  static serviceType = "forms";

  capabilityDescription =
    "Workspace-native forms service with persistent operator and autocoder intake templates.";

  private readonly rootDir = join(process.cwd(), ".eliza-agent", "forms");
  private readonly storePath = join(this.rootDir, "forms-store.json");

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    mkdirSync(this.rootDir, { recursive: true });
    if (!existsSync(this.storePath)) {
      this.writeStore({ forms: [] });
    }
  }

  static async start(runtime?: IAgentRuntime): Promise<FormsService> {
    return new FormsService(runtime);
  }

  async stop(): Promise<void> {}

  isPersistenceAvailable(): boolean {
    return true;
  }

  listForms(): StoredFormRecord[] {
    return this.readStore().forms;
  }

  getTemplates() {
    return DEFAULT_TEMPLATES;
  }

  async createForm(
    templateOrForm: unknown,
    metadata?: unknown,
  ): Promise<StoredFormRecord> {
    const templateId = this.resolveTemplateId(templateOrForm);
    const record: StoredFormRecord = {
      id: nextId("form"),
      templateId,
      status: "active",
      metadata:
        metadata && typeof metadata === "object"
          ? { ...(metadata as Record<string, unknown>) }
          : {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const store = this.readStore();
    store.forms.unshift(record);
    this.writeStore(store);
    return record;
  }

  async getForm(formId: string): Promise<StoredFormRecord | undefined> {
    return this.readStore().forms.find((entry) => entry.id === formId);
  }

  async cancelForm(formId: string): Promise<boolean> {
    const store = this.readStore();
    const form = store.forms.find((entry) => entry.id === formId);
    if (!form) {
      return false;
    }
    form.status = "cancelled";
    form.updatedAt = nowIso();
    this.writeStore(store);
    return true;
  }

  async forcePersist(): Promise<{ path: string; total: number }> {
    const store = this.readStore();
    this.writeStore(store);
    return {
      path: this.storePath,
      total: store.forms.length,
    };
  }

  private resolveTemplateId(input: unknown): string {
    if (typeof input === "string" && input in DEFAULT_TEMPLATES) {
      return input;
    }
    if (input && typeof input === "object") {
      const candidate =
        (input as { id?: unknown; templateId?: unknown }).templateId ??
        (input as { id?: unknown; templateId?: unknown }).id;
      if (typeof candidate === "string" && candidate in DEFAULT_TEMPLATES) {
        return candidate;
      }
    }
    return "project_scaffold";
  }

  private readStore(): FormsStore {
    try {
      const parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as {
        forms?: Array<Partial<StoredFormRecord>>;
      };
      return {
        forms: Array.isArray(parsed.forms)
          ? parsed.forms
              .filter(
                (
                  entry,
                ): entry is Partial<StoredFormRecord> &
                  Pick<StoredFormRecord, "id" | "templateId"> =>
                  Boolean(entry.id && entry.templateId),
              )
              .map((entry) => ({
                id: entry.id,
                templateId: entry.templateId,
                status:
                  entry.status === "completed" || entry.status === "cancelled"
                    ? entry.status
                    : "active",
                metadata:
                  entry.metadata && typeof entry.metadata === "object"
                    ? { ...(entry.metadata as Record<string, unknown>) }
                    : {},
                createdAt: entry.createdAt ?? nowIso(),
                updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
              }))
          : [],
      };
    } catch {
      return { forms: [] };
    }
  }

  private writeStore(store: FormsStore): void {
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
  }
}

const formsPlugin: Plugin = {
  name: "@elizaos/plugin-forms",
  description:
    "Workspace-native forms plugin for structured operator and autocoder workflows.",
  services: [FormsService],
  providers: [],
  actions: [],
  evaluators: [],
};

export default formsPlugin;
