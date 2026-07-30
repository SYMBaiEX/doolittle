import { configureEffectiveUserProfileModeling } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";
import {
  badRequest,
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type UserModelingBody = {
  userId: string;
  userMemoryMode?: "local" | "hybrid";
  assistantMemoryMode?: "local" | "hybrid";
  dialecticMode?: "off" | "assist" | "conclude";
};

async function readUserModelingBody(
  request: Request,
): Promise<UserModelingBody | null> {
  const body = await readJsonBody<Partial<UserModelingBody>>(request);
  if (!body.userId) {
    return null;
  }

  return {
    userId: body.userId,
    userMemoryMode: body.userMemoryMode,
    assistantMemoryMode: body.assistantMemoryMode,
    dialecticMode: body.dialecticMode,
  };
}

export const handleUserModeling: IdentityProfileRouteHandler = async ({
  context,
  request,
}) => {
  const body = await readUserModelingBody(request);
  if (!body) {
    return badRequest("userId is required");
  }

  return json({
    profile: configureEffectiveUserProfileModeling(
      context.runtime,
      body.userId,
      {
        userMemoryMode: body.userMemoryMode,
        assistantMemoryMode: body.assistantMemoryMode,
        dialecticMode: body.dialecticMode,
      },
    ),
  });
};
