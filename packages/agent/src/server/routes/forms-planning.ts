import type { AppContext } from "@/runtime/bootstrap";
import {
  approveEffectivePlan,
  cancelEffectiveForm,
  createEffectiveForm,
  createEffectivePlan,
  getEffectiveForm,
  getEffectiveFormTemplates,
  getEffectivePlan,
  listEffectiveForms,
  listEffectivePlans,
  steerEffectivePlan,
} from "@/runtime/native/service-bridge/autocoder";
import {
  getNativeFormsControlPlane,
  getNativePlanningControlPlane,
} from "@/runtime/native/service-bridge/control-planes";
import { json } from "@/server/responses";
import { parseOpaqueRouteId } from "@/server/routes/parse-opaque-id";

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

  const planAction = url.pathname.match(/^\/plans\/([^/]+)\/(approve|steer)$/);
  if (request.method === "POST" && planAction) {
    const planId = parseOpaqueRouteId(planAction[1]);
    if (!planId) {
      return json({ error: "Plan identifier is invalid." }, 400);
    }
    const action = planAction[2];
    if (action === "approve") {
      try {
        const result = (await approveEffectivePlan(
          context.runtime,
          planId,
        )) as {
          kind: string;
          plan?: unknown;
        };
        if (result.kind === "not_found") {
          return json({ error: "Plan not found." }, 404);
        }
        if (result.kind === "invalid_state") {
          return json(
            { error: "Only draft plans can be approved.", plan: result.plan },
            409,
          );
        }
        return json({ plan: result.plan });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Reviewed-plan approval is unavailable.",
          },
          409,
        );
      }
    }

    let body: { instruction?: unknown };
    try {
      body = (await request.json()) as { instruction?: unknown };
    } catch {
      return json({ error: "A JSON instruction is required." }, 400);
    }
    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (instruction.length < 1 || instruction.length > 4000) {
      return json(
        { error: "instruction must be between 1 and 4000 characters." },
        400,
      );
    }
    try {
      const result = (await steerEffectivePlan(
        context.runtime,
        planId,
        instruction,
      )) as { kind: string; plan?: unknown; taskId?: string; status?: unknown };
      if (result.kind === "not_found") {
        return json({ error: "Plan not found." }, 404);
      }
      if (result.kind === "unlinked") {
        return json(
          { error: "This active plan is not linked to a product task." },
          409,
        );
      }
      if (result.kind === "task_not_found") {
        return json({ error: "The linked product task was not found." }, 409);
      }
      if (result.kind === "task_not_steerable") {
        return json(
          {
            error:
              "The linked Eliza task is paused, terminal, or otherwise not accepting operator steering.",
            taskId: result.taskId,
            status: result.status,
          },
          409,
        );
      }
      if (result.kind === "invalid_instruction") {
        return json(
          { error: "instruction must be between 1 and 4000 characters." },
          400,
        );
      }
      if (result.kind === "orchestrator_unavailable") {
        return json(
          {
            error:
              "Operator steering requires the official Eliza orchestrator service.",
          },
          503,
        );
      }
      if (result.kind === "invalid_state") {
        return json(
          { error: "Only active plans can be steered.", plan: result.plan },
          409,
        );
      }
      return json({ plan: result.plan, taskId: result.taskId, steered: true });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Operator steering is unavailable.",
        },
        409,
      );
    }
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/forms/") &&
    !url.pathname.endsWith("/cancel")
  ) {
    const formId = parseOpaqueRouteId(url.pathname.replace("/forms/", ""));
    if (!formId) {
      return json({ error: "Form identifier is invalid." }, 400);
    }
    return json({
      form: await getEffectiveForm(context.runtime, formId),
    });
  }

  if (request.method === "GET" && url.pathname.startsWith("/plans/")) {
    const planId = parseOpaqueRouteId(url.pathname.replace("/plans/", ""));
    if (!planId) {
      return json({ error: "Plan identifier is invalid." }, 400);
    }
    return json({
      plan: await getEffectivePlan(context.runtime, planId),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/forms/") &&
    url.pathname.endsWith("/cancel")
  ) {
    const formId = parseOpaqueRouteId(
      url.pathname.replace("/forms/", "").replace("/cancel", ""),
    );
    if (!formId) {
      return json({ error: "Form identifier is invalid." }, 400);
    }
    return json({
      cancelled: await cancelEffectiveForm(context.runtime, formId),
    });
  }

  return null;
}
