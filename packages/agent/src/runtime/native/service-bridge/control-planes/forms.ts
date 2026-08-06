import { getNativeServices } from "../runtime";
import { countEntriesByStatus, countRecordLikeEntries } from "./shared";
import type { RuntimeLike } from "./types";

export function getNativeFormsControlPlane(runtime: RuntimeLike) {
  const forms = getNativeServices(runtime).forms;
  const rawForms = forms?.listForms?.() ?? [];
  const formEntries = Array.isArray(rawForms) ? rawForms : [];
  const templates = countRecordLikeEntries(forms?.getTemplates?.());
  const persistenceAvailable = forms?.isPersistenceAvailable?.() ?? false;

  return {
    source: forms ? ("product-plugin" as const) : ("unavailable" as const),
    available: Boolean(forms),
    capability:
      forms?.capabilityDescription ??
      "Structured form workflows for Doolittle planning and operator collection flows.",
    persistenceAvailable,
    templates,
    forms: {
      total: formEntries.length,
      active: countEntriesByStatus(formEntries, "active"),
      completed: countEntriesByStatus(formEntries, "completed"),
      cancelled: countEntriesByStatus(formEntries, "cancelled"),
    },
    supportsForcePersist: typeof forms?.forcePersist === "function",
    detail: forms
      ? `Forms service is live with ${templates} templates and ${formEntries.length} tracked forms.`
      : "Doolittle forms service is not available in the Eliza runtime.",
  };
}
