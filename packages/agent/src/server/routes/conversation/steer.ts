import type { ChatRunSteerRejectionCode } from "@doolittle/contracts/steer";
import type { AppContext } from "../../../runtime/bootstrap/index";
import { submitRunSteer } from "../../../runtime/chat-turn/steer";
import { readJsonObjectBody } from "../../request-body";
import { json } from "../../responses";

function invalidBodyResponse(reason: "invalid_json" | "not_object"): Response {
  return json(
    {
      error:
        reason === "invalid_json"
          ? "request body must be valid JSON"
          : "request body must be a JSON object",
    },
    400,
  );
}

function rejectionStatus(code: ChatRunSteerRejectionCode): number {
  if (code === "empty_message") return 400;
  if (code === "steer_persistence_failed") return 500;
  return 409;
}

/**
 * Admits user input into an already active run. The path run id is
 * authoritative; the session is resolved from the durable run receipt rather
 * than trusting a client-supplied conversation identifier.
 */
export async function handleChatRunSteerRoute(
  context: AppContext,
  request: Request,
  runId: string,
  submit: typeof submitRunSteer = submitRunSteer,
): Promise<Response> {
  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) return invalidBodyResponse(parsed.reason);
  const body = parsed.value;
  if (typeof body.message !== "string") {
    return json({ error: "message must be a string" }, 400);
  }
  if (body.userId !== undefined && typeof body.userId !== "string") {
    return json({ error: "userId must be a string" }, 400);
  }

  const receipt = context.services.runController.getByRunId(runId);
  if (!receipt) {
    return json(
      {
        accepted: false,
        code: "run_not_active",
        error: "No active steerable run exists for this run id.",
        message: "No active steerable run exists for this run id.",
      },
      404,
    );
  }

  const result = await submit({
    context,
    runId,
    sessionId: receipt.sessionId,
    message: body.message,
    ...(typeof body.userId === "string" ? { userId: body.userId } : {}),
    signal: request.signal,
  });
  if (result.accepted) return json(result, 202);
  return json(
    {
      ...result,
      // Desktop transport surfaces `error`; `message` remains the steer contract.
      error: result.message,
    },
    rejectionStatus(result.code),
  );
}
