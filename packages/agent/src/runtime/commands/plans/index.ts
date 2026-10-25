import type { AgentExecutionContext } from "../../chat";
import {
  createEffectivePlan,
  getEffectivePlan,
  listEffectivePlans,
} from "../../native/service-bridge/autocoder/index";
import { getNativePlanningControlPlane } from "../../native/service-bridge/control-planes/index";

export async function handlePlansCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const todoCreatePrefix = "/todo add ";
  const planCreatePrefix = "/plans create ";

  if (trimmed === "/runtime planning") {
    return JSON.stringify(
      getNativePlanningControlPlane(context.runtime),
      null,
      2,
    );
  }

  if (
    trimmed === "/plans" ||
    trimmed === "/plans list" ||
    trimmed === "/todo" ||
    trimmed === "/todo list"
  ) {
    return JSON.stringify(
      {
        control: getNativePlanningControlPlane(context.runtime),
        plans: await listEffectivePlans(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/plans show ") || trimmed.startsWith("/todo show ")) {
    const planId = trimmed.replace(/^\/(?:plans|todo) show /u, "").trim();
    if (!planId) {
      return "Usage: /plans show <plan-id> or /todo show <plan-id>";
    }
    return JSON.stringify(
      {
        plan: await getEffectivePlan(context.runtime, planId),
      },
      null,
      2,
    );
  }

  if (
    trimmed.startsWith(planCreatePrefix) ||
    trimmed.startsWith(todoCreatePrefix)
  ) {
    const isTodo = trimmed.startsWith(todoCreatePrefix);
    const payload = trimmed
      .replace(isTodo ? todoCreatePrefix : planCreatePrefix, "")
      .trim();
    if (!payload) {
      return "Usage: /plans create <title> :: <objective> [:: <json-metadata>] or /todo add <title> :: <objective>";
    }
    const [titlePart, objectivePart, metadataRaw] = payload
      .split("::")
      .map((part) => part.trim());
    if (!titlePart || !objectivePart) {
      return "Usage: /plans create <title> :: <objective> [:: <json-metadata>] or /todo add <title> :: <objective>";
    }
    let metadata: unknown;
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        return "Usage: /plans create <title> :: <objective> [:: <json-metadata>] or /todo add <title> :: <objective>";
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
