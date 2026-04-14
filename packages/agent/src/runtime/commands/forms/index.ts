import {
  cancelEffectiveForm,
  createEffectiveForm,
  getEffectiveForm,
  getEffectiveFormTemplates,
  listEffectiveForms,
} from "@/runtime/native/service-bridge/autocoder";
import { getNativeFormsControlPlane } from "@/runtime/native/service-bridge/control-planes";
import type { AgentExecutionContext } from "../../chat";

export async function handleFormsCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/runtime forms") {
    return JSON.stringify(getNativeFormsControlPlane(context.runtime), null, 2);
  }

  if (trimmed === "/forms" || trimmed === "/forms list") {
    return JSON.stringify(
      {
        control: getNativeFormsControlPlane(context.runtime),
        forms: await listEffectiveForms(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed === "/forms templates") {
    return JSON.stringify(
      {
        control: getNativeFormsControlPlane(context.runtime),
        templates: getEffectiveFormTemplates(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/forms show ")) {
    const formId = trimmed.replace("/forms show ", "").trim();
    if (!formId) {
      return "Usage: /forms show <form-id>";
    }
    return JSON.stringify(
      {
        form: await getEffectiveForm(context.runtime, formId),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/forms create ")) {
    const payload = trimmed.replace("/forms create ", "").trim();
    if (!payload) {
      return "Usage: /forms create <template-id> [:: <json-metadata>]";
    }
    const [templateId, metadataRaw] = payload
      .split("::")
      .map((part) => part.trim());
    let metadata: unknown;
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        return "Usage: /forms create <template-id> [:: <json-metadata>]";
      }
    }
    return JSON.stringify(
      {
        form: await createEffectiveForm(context.runtime, templateId, metadata),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/forms cancel ")) {
    const formId = trimmed.replace("/forms cancel ", "").trim();
    if (!formId) {
      return "Usage: /forms cancel <form-id>";
    }
    return JSON.stringify(
      {
        cancelled: await cancelEffectiveForm(context.runtime, formId),
      },
      null,
      2,
    );
  }

  return undefined;
}
