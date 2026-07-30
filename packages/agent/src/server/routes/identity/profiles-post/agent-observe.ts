import { observeEffectiveAgentProfile } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";
import {
  badRequest,
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type AgentObserveBody = {
  note: string;
  source?: string;
};

async function readAgentObserveBody(
  request: Request,
): Promise<AgentObserveBody | null> {
  const body = await readJsonBody<Partial<AgentObserveBody>>(request);
  if (!body.note) {
    return null;
  }

  return {
    note: body.note,
    source: body.source,
  };
}

export const handleAgentObserve: IdentityProfileRouteHandler = async ({
  context,
  request,
}) => {
  const body = await readAgentObserveBody(request);
  if (!body) {
    return badRequest("note is required");
  }

  return json({
    profile: observeEffectiveAgentProfile(
      context.runtime,
      body.note,
      body.source,
    ),
  });
};
