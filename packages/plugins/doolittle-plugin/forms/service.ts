import { join } from "node:path";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type UUID,
} from "@elizaos/core";
import type { FormDefinition, FormSession } from "@elizaos/plugin-form";
import { nextId, nowIso } from "../record-utils";
import { DEFAULT_TEMPLATES } from "./constants";
import { normalizeMetadata, resolveTemplateId } from "./normalization";
import { ensureStoreInitialized, readStore, writeStore } from "./storage";
import type { FormsStore, StoredFormRecord } from "./types";

type NativeFormService = {
  registerForm(definition: FormDefinition): void;
  startSession(
    formId: string,
    entityId: UUID,
    roomId: UUID,
  ): Promise<FormSession>;
};

function labelFor(field: string): string {
  return field
    .replace(/([A-Z])/gu, " $1")
    .replace(/^./u, (value) => value.toUpperCase());
}

export const NATIVE_DEFAULT_TEMPLATES: FormDefinition[] = Object.values(
  DEFAULT_TEMPLATES,
).map((template) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  controls: template.fields.map((field) => ({
    key: field,
    label: labelFor(field),
    type: "text",
    required: true,
    askPrompt: `What is the ${labelFor(field).toLowerCase()}?`,
  })),
}));

export const createFormsService = (storageRoot: string) => {
  class FormsService extends ElizaService {
    static serviceType = "forms";

    capabilityDescription =
      "Doolittle-owned forms service with persistent operator and autocoder intake templates.";

    private readonly rootDir = storageRoot;
    private readonly storePath = join(this.rootDir, "forms-store.json");

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
      ensureStoreInitialized(this.rootDir, this.storePath);
    }

    static async start(runtime?: IAgentRuntime): Promise<FormsService> {
      const service = new FormsService(runtime);
      service.registerNativeTemplates(runtime);
      return service;
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

    /**
     * Starts a native conversational form while retaining the Doolittle store
     * for existing operator and autocoder records.
     */
    async startNativeSession(
      templateOrForm: unknown,
      entityId: UUID,
      roomId: UUID,
    ): Promise<FormSession> {
      const templateId = resolveTemplateId(templateOrForm);
      const formService = this.nativeFormService(this.runtime);
      if (!formService) {
        throw new Error(
          "Native FormService is unavailable; load @elizaos/plugin-form before @doolittle/plugin-forms.",
        );
      }
      return formService.startSession(templateId, entityId, roomId);
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

    private registerNativeTemplates(runtime?: IAgentRuntime): void {
      const formService = this.nativeFormService(runtime);
      if (!formService) {
        return;
      }
      for (const template of NATIVE_DEFAULT_TEMPLATES) {
        formService.registerForm(template);
      }
    }

    private nativeFormService(
      runtime?: IAgentRuntime,
    ): NativeFormService | undefined {
      const candidate = runtime?.getService("FORM");
      const nativeCandidate = candidate as unknown as NativeFormService | null;
      if (
        nativeCandidate &&
        typeof nativeCandidate.registerForm === "function" &&
        typeof nativeCandidate.startSession === "function"
      ) {
        return nativeCandidate;
      }
      return undefined;
    }
  }

  return FormsService;
};
