export type FormMetadataValue =
  | string
  | number
  | boolean
  | null
  | FormMetadataValue[]
  | { [key: string]: FormMetadataValue };

export interface StoredFormRecord {
  id: string;
  templateId: string;
  status: "active" | "completed" | "cancelled";
  metadata: Record<string, FormMetadataValue>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPlanRecord {
  id: string;
  title: string;
  objective: string;
  status: "draft" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  workflowId?: string;
  metadata: Record<string, unknown>;
  steps: string[];
}
