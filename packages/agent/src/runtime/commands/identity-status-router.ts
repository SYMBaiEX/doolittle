import {
  getEffectiveExperienceSummary,
  getEffectivePersonalityList,
  getEffectivePersonalitySummary,
} from "@/runtime/native/service-bridge/ownership";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { AgentExecutionContext } from "../chat";

export async function handleIdentityStatusCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: {
    formatPersonalitySummary: (summary: {
      total: number;
      activeId?: string;
      names: string[];
    }) => string;
    buildSystemFactsContext: (context: AgentExecutionContext) => string;
  },
): Promise<string | undefined> {
  if (trimmed === "/personality" || trimmed === "/personality status") {
    const active = context.services.personalities.getActive();
    return [
      `${active.name} (${active.id})`,
      active.description,
      active.systemAddendum,
      `Summary: ${options.formatPersonalitySummary(
        getEffectivePersonalitySummary(context.runtime, context.services),
      )}`,
    ].join("\n");
  }

  if (trimmed === "/personality list") {
    return (
      getEffectivePersonalityList(context.runtime, context.services) as Array<{
        id: string;
        description: string;
      }>
    )
      .map((profile) => `- ${profile.id}: ${profile.description}`)
      .join("\n");
  }

  if (trimmed.startsWith("/personality set ")) {
    const id = trimmed.replace("/personality set ", "").trim();
    const profile =
      (getNativeServices(context.runtime).personality?.activate(id) as
        | { id: string; name: string }
        | undefined) ?? context.services.personalities.setActive(id);
    return `Active personality set to ${profile.name}.`;
  }

  if (trimmed === "/personality summary") {
    return JSON.stringify(
      getEffectivePersonalitySummary(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/system" || trimmed === "/system facts") {
    return options.buildSystemFactsContext(context);
  }

  if (trimmed === "/experience" || trimmed === "/experience summary") {
    return JSON.stringify(
      getEffectiveExperienceSummary(context.runtime, context.services),
      null,
      2,
    );
  }

  return undefined;
}
