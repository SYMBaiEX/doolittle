import type {
  PluginStorageBinding,
  StoredFormRecord,
} from "@doolittle/contracts";

export type { FormMetadataValue, StoredFormRecord } from "@doolittle/contracts";

export interface FormsPluginOptions {
  storage: PluginStorageBinding;
}

export interface FormTemplateRef {
  id?: string;
  templateId?: string;
}

export interface FormsStore {
  forms: StoredFormRecord[];
}
