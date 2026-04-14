import { json } from "@/server/responses";
import {
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type AgentSeedBody = {
  name?: string;
  goals?: string[];
  strengths?: string[];
  workStyle?: string[];
  notes?: string[];
};

async function readAgentSeedBody(request: Request): Promise<AgentSeedBody> {
  return readJsonBody<AgentSeedBody>(request);
}

export const handleAgentSeed: IdentityProfileRouteHandler = async ({
  context,
  request,
}) => {
  const body = await readAgentSeedBody(request);

  return json({
    profile: context.services.userProfiles.seedAgent(body),
  });
};
