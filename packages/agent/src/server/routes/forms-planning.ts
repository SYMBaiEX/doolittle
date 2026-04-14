import type { AppContext } from "@/runtime/bootstrap";
import {
  cancelEffectiveForm,
  createEffectiveForm,
  createEffectivePlan,
  getEffectiveForm,
  getEffectiveFormTemplates,
  getEffectivePlan,
  listEffectiveForms,
  listEffectivePlans,
} from "@/runtime/native/service-bridge/autocoder";
import {
  getNativeFormsControlPlane,
  getNativePlanningControlPlane,
} from "@/runtime/native/service-bridge/control-planes";
import { json } from "@/server/responses";

export async function handleFormsPlanningRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/forms") {
    return json({
      forms: getNativeFormsControlPlane(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/planning") {
    return json({
      planning: getNativePlanningControlPlane(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/forms") {
    return json({
      control: getNativeFormsControlPlane(context.runtime),
      forms: await listEffectiveForms(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/plans") {
    return json({
      control: getNativePlanningControlPlane(context.runtime),
      plans: await listEffectivePlans(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/forms/templates") {
    return json({
      control: getNativeFormsControlPlane(context.runtime),
      templates: getEffectiveFormTemplates(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/forms/create") {
    const body = (await request.json()) as {
      template?: string;
      form?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };
    if (!body.template && !body.form) {
      return json({ error: "template or form is required" }, 400);
    }
    return json({
      form: await createEffectiveForm(
        context.runtime,
        body.template ?? body.form,
        body.metadata,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/plans/create") {
    const body = (await request.json()) as {
      title?: string;
      objective?: string;
      status?: "draft" | "active" | "completed";
      taskId?: string;
      workflowId?: string;
      metadata?: Record<string, unknown>;
      steps?: string[];
    };
    if (!body.title || !body.objective) {
      return json({ error: "title and objective are required" }, 400);
    }
    return json({
      plan: await createEffectivePlan(context.runtime, body),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/forms/") &&
    !url.pathname.endsWith("/cancel")
  ) {
    const formId = decodeURIComponent(url.pathname.replace("/forms/", ""));
    return json({
      form: await getEffectiveForm(context.runtime, formId),
    });
  }

  if (request.method === "GET" && url.pathname.startsWith("/plans/")) {
    const planId = decodeURIComponent(url.pathname.replace("/plans/", ""));
    return json({
      plan: await getEffectivePlan(context.runtime, planId),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/forms/") &&
    url.pathname.endsWith("/cancel")
  ) {
    const formId = decodeURIComponent(
      url.pathname.replace("/forms/", "").replace("/cancel", ""),
    );
    return json({
      cancelled: await cancelEffectiveForm(context.runtime, formId),
    });
  }

  return null;
}
