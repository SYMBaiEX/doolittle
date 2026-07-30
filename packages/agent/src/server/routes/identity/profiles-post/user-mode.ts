import { setEffectiveUserProfileMode } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";
import {
  badRequest,
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type UserModeBody = {
  userId: string;
  mode: "local" | "hybrid";
};

async function readUserModeBody(
  request: Request,
): Promise<UserModeBody | null> {
  const body = await readJsonBody<Partial<UserModeBody>>(request);
  if (!body.userId || (body.mode !== "local" && body.mode !== "hybrid")) {
    return null;
  }

  return {
    userId: body.userId,
    mode: body.mode,
  };
}

export const handleUserMode: IdentityProfileRouteHandler = async ({
  context,
  request,
}) => {
  const body = await readUserModeBody(request);
  if (!body) {
    return badRequest("userId and mode are required");
  }

  return json({
    profile: setEffectiveUserProfileMode(
      context.runtime,
      body.userId,
      body.mode,
    ),
  });
};
