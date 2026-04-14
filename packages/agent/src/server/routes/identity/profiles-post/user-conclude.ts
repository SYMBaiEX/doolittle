import { json } from "@/server/responses";
import {
  badRequest,
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type UserConcludeBody = {
  userId: string;
  query: string;
  conclusion: string;
  source?: string;
};

async function readUserConcludeBody(
  request: Request,
): Promise<UserConcludeBody | null> {
  const body = await readJsonBody<Partial<UserConcludeBody>>(request);
  if (!body.userId || !body.query || !body.conclusion) {
    return null;
  }

  return {
    userId: body.userId,
    query: body.query,
    conclusion: body.conclusion,
    source: body.source,
  };
}

export const handleUserConclude: IdentityProfileRouteHandler = async ({
  context,
  request,
}) => {
  const body = await readUserConcludeBody(request);
  if (!body) {
    return badRequest("userId, query, and conclusion are required");
  }

  return json({
    context: context.services.userProfiles.context(body.userId, body.query),
    conclusion: context.services.userProfiles.conclude(
      body.userId,
      body.query,
      body.conclusion,
      body.source,
    ),
  });
};
