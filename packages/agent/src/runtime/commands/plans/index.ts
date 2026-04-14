import {
  createEffectivePlan,
  getEffectivePlan,
  listEffectivePlans,
} from "@/runtime/native/service-bridge/autocoder";
import { getNativePlanningControlPlane } from "@/runtime/native/service-bridge/control-planes";
import type { AgentExecutionContext } from "../../chat";

export async function handlePlansCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/runtime planning") {
    return JSON.stringify(
      getNativePlanningControlPlane(context.runtime),
      null,
      2,
    );
  }

  if (trimmed === "/plans" || trimmed === "/plans list") {
    return JSON.stringify(
      {
        control: getNativePlanningControlPlane(context.runtime),
        plans: await listEffectivePlans(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/plans show ")) {
    const planId = trimmed.replace("/plans show ", "").trim();
    if (!planId) {
      return "Usage: /plans show <plan-id>";
    }
    return JSON.stringify(
      {
        plan: await getEffectivePlan(context.runtime, planId),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/plans create ")) {
    const payload = trimmed.replace("/plans create ", "").trim();
    if (!payload) {
      return "Usage: /plans create <title> :: <objective> [:: <json-metadata>]";
    }
    const [titlePart, objectivePart, metadataRaw] = payload
      .split("::")
      .map((part) => part.trim());
    if (!titlePart || !objectivePart) {
      return "Usage: /plans create <title> :: <objective> [:: <json-metadata>]";
    }
    let metadata: unknown;
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        return "Usage: /plans create <title> :: <objective> [:: <json-metadata>]";
      }
    }
    return JSON.stringify(
      {
        plan: await createEffectivePlan(context.runtime, {
          title: titlePart,
          objective: objectivePart,
          metadata,
        }),
      },
      null,
      2,
    );
  }

  return undefined;
}
