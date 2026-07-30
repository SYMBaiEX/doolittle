import type { AgentExecutionContext } from "@/runtime/chat";
import type { AutomationRuntimeOverrides } from "@/types/runtime";

export function applyRuntimeOverrides(
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>,
  runtime?: AutomationRuntimeOverrides,
): ReturnType<AgentExecutionContext["services"]["settings"]["get"]> {
  if (!runtime) {
    return settings;
  }

  return {
    ...settings,
    model: {
      ...settings.model,
      provider: runtime.provider ?? settings.model.provider,
      model: runtime.model ?? settings.model.model,
      baseUrl: runtime.baseUrl ?? settings.model.baseUrl,
      temperature: runtime.temperature ?? settings.model.temperature,
      maxTokens: runtime.maxTokens ?? settings.model.maxTokens,
    },
  };
}
