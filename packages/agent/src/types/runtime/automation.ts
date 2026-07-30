export type {
  AutomationAction,
  AutomationCondition,
  AutomationJobRecord,
  AutomationRunRecord,
  AutomationRunStatus,
  AutomationRuntimeOverrides,
  AutomationTracePhase,
  AutomationTraceStep,
  AutomationTrigger,
} from "@doolittle/contracts";

export interface SkillDocument {
  slug: string;
  title: string;
  description: string;
  path: string;
  content: string;
  source?:
    | "workspace"
    | "generated"
    | "bundled"
    | "managed"
    | "project"
    | "curated"
    | "plugin"
    | "extra";
  commandName?: string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
}

export interface HookDefinition {
  id: string;
  event: string;
  name: string;
  enabled: boolean;
  template: string;
}

export interface HookInvocation {
  hookId: string;
  event: string;
  payload: Record<string, unknown>;
  rendered: string;
  createdAt: string;
}
