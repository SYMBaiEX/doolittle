import { rememberEffectiveUserProfile } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";
import {
  badRequest,
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type UserRememberBody = {
  userId: string;
  kind:
    | "preference"
    | "fact"
    | "belief"
    | "goal"
    | "context"
    | "constraint"
    | "relationship"
    | "note"
    | "memory";
  value: string;
  source?: string;
};

async function readUserRememberBody(
  request: Request,
): Promise<UserRememberBody | null> {
  const body = await readJsonBody<Partial<UserRememberBody>>(request);
  if (!body.userId || !body.kind || !body.value) {
    return null;
  }

  return {
    userId: body.userId,
    kind: body.kind,
    value: body.value,
    source: body.source,
  };
}

export const handleUserRemember: IdentityProfileRouteHandler = async ({
  context,
  request,
}) => {
  const body = await readUserRememberBody(request);
  if (!body) {
    return badRequest("userId, kind, and value are required");
  }

  return json({
    profile: rememberEffectiveUserProfile(
      context.runtime,
      context.services,
      body.userId,
      body.kind,
      body.value,
      body.source,
    ),
  });
};
