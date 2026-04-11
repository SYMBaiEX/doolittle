import { join } from "node:path";
import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";
import { DEFAULT_TEMPLATES } from "./constants";
import { normalizeMetadata, resolveTemplateId } from "./normalization";
import { ensureStoreInitialized, readStore, writeStore } from "./storage";
import type { FormsStore, StoredFormRecord } from "./types";
import { nextId, nowIso } from "./utils";

export const createFormsService = (storageRoot: string) => {
  class FormsService extends ElizaService {
    static serviceType = "forms";

    capabilityDescription =
      "Workspace-native forms service with persistent operator and autocoder intake templates.";

    private readonly rootDir = storageRoot;
    private readonly storePath = join(this.rootDir, "forms-store.json");

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
      ensureStoreInitialized(this.rootDir, this.storePath);
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
      const templateId = resolveTemplateId(templateOrForm);
      const record: StoredFormRecord = {
        id: nextId("form"),
        templateId,
        status: "active",
        metadata: normalizeMetadata(metadata),
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

    private readStore(): FormsStore {
      return readStore(this.storePath);
    }

    private writeStore(store: FormsStore): void {
      writeStore(this.storePath, store);
    }
  }

  return FormsService;
};
