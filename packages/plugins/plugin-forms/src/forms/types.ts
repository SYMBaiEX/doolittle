import type {
  PluginStorageOptions,
  StoredFormRecord,
} from "@doolittle/contracts";

export type { FormMetadataValue, StoredFormRecord } from "@doolittle/contracts";

export interface FormsPluginOptions {
  storage?: PluginStorageOptions;
}

export interface FormTemplateRef {
  id?: string;
  templateId?: string;
}

export interface FormsStore {
  forms: StoredFormRecord[];
}
