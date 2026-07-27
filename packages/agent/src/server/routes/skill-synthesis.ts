import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";
import {
  type CreateSkillProposalInput,
  SkillProposalValidationError,
} from "@/services/skill-synthesis/service";

const proposalIdPattern = /^skill-proposal-[0-9a-f-]{36}$/u;

async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function proposalInput(
  body: Record<string, unknown>,
): CreateSkillProposalInput | null {
  const slug = stringValue(body.slug);
  const content = stringValue(body.content);
  if (!slug || content === undefined) return null;
  return {
    slug,
    content,
    title: stringValue(body.title),
    description: stringValue(body.description),
    taskId: stringValue(body.taskId),
    objective: stringValue(body.objective),
    noteCount: numberValue(body.noteCount),
    signalCount: numberValue(body.signalCount),
  };
}

function proposalAction(
  pathname: string,
): { id: string; action: "approve" | "reject" } | null {
  const match = pathname.match(
    /^\/skills\/proposals\/([^/]+)\/(approve|reject)$/u,
  );
  if (!match || !proposalIdPattern.test(match[1])) return null;
  return { id: match[1], action: match[2] as "approve" | "reject" };
}

export async function handleSkillSynthesisRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  // Existing clients use this endpoint as an immediate, legacy synthesis
  // action. Keep its exact response contract; proposal endpoints below are
  // the reviewed path and are the only new way to activate proposal content.
  if (request.method === "POST" && url.pathname === "/skills/synthesize") {
    const body = await readJson(request);
    const taskId = body && stringValue(body.taskId);
    if (!taskId) return json({ error: "taskId is required" }, 400);

    const path =
      (await getNativeServices(context.runtime).agentSkills?.synthesize(
        taskId,
      )) ??
      (() => {
        const task = context.services.delegation
          .list()
          .find((entry) => entry.id === taskId);
        if (!task) return null;
        return context.services.skillSynthesis.synthesizeFromTask(task);
      })();

    return path
      ? json({ path })
      : json({ error: "Delegation task not found" }, 404);
  }

  if (request.method === "GET" && url.pathname === "/skills/proposals") {
    const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(0, Math.min(Math.floor(requestedLimit), 100))
      : 100;
    return json({
      proposals: context.services.skillSynthesis.listProposals(limit),
    });
  }

  if (request.method === "POST" && url.pathname === "/skills/proposals") {
    const body = await readJson(request);
    const input = body && proposalInput(body);
    if (!input) {
      return json({ error: "slug and content are required" }, 400);
    }
    try {
      const proposal = context.services.skillSynthesis.createProposal(input);
      return json({ proposal }, 201);
    } catch (error) {
      if (error instanceof SkillProposalValidationError) {
        return json(
          { error: "Invalid skill proposal", errors: error.errors },
          400,
        );
      }
      throw error;
    }
  }

  const detailMatch = url.pathname.match(/^\/skills\/proposals\/([^/]+)$/u);
  if (request.method === "GET" && detailMatch) {
    if (!proposalIdPattern.test(detailMatch[1])) {
      return json({ error: "Invalid proposal id" }, 400);
    }
    const proposal = context.services.skillSynthesis.getProposal(
      detailMatch[1],
    );
    return proposal
      ? json({ proposal })
      : json({ error: "Skill proposal not found" }, 404);
  }

  const action = proposalAction(url.pathname);
  if (request.method === "POST" && action) {
    const body = await readJson(request);
    const transition =
      action.action === "approve"
        ? context.services.skillSynthesis.approveProposal(action.id)
        : context.services.skillSynthesis.rejectProposal(
            action.id,
            body ? stringValue(body.reason) : undefined,
          );
    switch (transition.kind) {
      case "approved":
      case "rejected":
        return json({
          proposal: transition.proposal,
          idempotent: transition.idempotent,
        });
      case "not_found":
        return json({ error: "Skill proposal not found" }, 404);
      case "invalid":
        return json(
          {
            error: "Skill proposal is no longer valid",
            errors: transition.errors,
          },
          409,
        );
      case "blocked":
        return json(
          {
            error: "Skill proposal is blocked by the safety scan",
            proposal: transition.proposal,
          },
          409,
        );
      case "already_decided":
        return json(
          {
            error: "Skill proposal already has a different disposition",
            proposal: transition.proposal,
          },
          409,
        );
    }
  }

  return null;
}
