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
  nativeServices,
}) => {
  const body = await readAgentObserveBody(request);
  if (!body) {
    return badRequest("note is required");
  }

  return json({
    profile:
      nativeServices.rolodex?.observeAgent(body.note, body.source) ??
      context.services.userProfiles.observeAgent(body.note, body.source),
  });
};
