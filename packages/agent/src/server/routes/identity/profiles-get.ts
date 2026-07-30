import {
  getEffectiveAgentProfile,
  getEffectiveRolodexSummary,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfile,
  getEffectiveUserProfileCard,
  getEffectiveUserProfileContext,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
  listEffectiveUserProfiles,
  recallEffectiveUserProfile,
} from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";
import {
  badRequest,
  getPositiveLimit,
  getSearchParam,
  type IdentityProfileRouteHandler,
  type IdentityProfileRouteInput,
} from "./profiles-shared";

const handleUserProfiles: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  return json({
    profiles: userId
      ? [getEffectiveUserProfile(context.runtime, userId)]
      : listEffectiveUserProfiles(context.runtime),
  });
};

const handleUserSearch: IdentityProfileRouteHandler = ({ context, url }) => {
  const query = getSearchParam(url, "query");
  if (!query) {
    return badRequest("query is required");
  }

  return json({
    hits: getEffectiveUserProfileSearch(
      context.runtime,
      query,
      getPositiveLimit(url, "limit", 10),
    ),
  });
};

const handleUserCard: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  if (!userId) {
    return badRequest("userId is required");
  }

  return json({
    card: getEffectiveUserProfileCard(context.runtime, userId),
    summary: getEffectiveRolodexSummary(context.runtime),
  });
};

const handleUserRecall: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  const query = getSearchParam(url, "query");
  if (!userId || !query) {
    return badRequest("userId and query are required");
  }

  return json({
    hits: recallEffectiveUserProfile(context.runtime, userId, query),
  });
};

const handleUserBeliefs: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  if (!userId) {
    return badRequest("userId is required");
  }

  return json({
    beliefs: getEffectiveUserBeliefs(context.runtime, userId),
  });
};

const handleUserRelationship: IdentityProfileRouteHandler = ({
  context,
  url,
}) => {
  const userId = getSearchParam(url, "userId");
  if (!userId) {
    return badRequest("userId is required");
  }

  return json({
    relationship: getEffectiveUserRelationship(context.runtime, userId),
  });
};

const handleUserEngagement: IdentityProfileRouteHandler = ({
  context,
  url,
}) => {
  const userId = getSearchParam(url, "userId");
  if (!userId) {
    return badRequest("userId is required");
  }

  return json({
    engagement: getEffectiveUserEngagement(context.runtime, userId),
  });
};

const handleAgentProfile: IdentityProfileRouteHandler = ({ context }) => {
  const agentProfile = getEffectiveAgentProfile(context.runtime);

  return json({
    profile: agentProfile,
    card: agentProfile,
    summary: getEffectiveRolodexSummary(context.runtime),
  });
};

const handleUserSummary: IdentityProfileRouteHandler = ({ context }) =>
  json({
    summary: getEffectiveUserProfileSummary(context.runtime),
  });

const handleUserContext: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  const query = getSearchParam(url, "query");
  if (!userId || !query) {
    return badRequest("userId and query are required");
  }

  return json({
    context: getEffectiveUserProfileContext(context.runtime, userId, query),
  });
};

const GET_ROUTES: Record<string, IdentityProfileRouteHandler> = {
  "/profiles/users": handleUserProfiles,
  "/profiles/users/search": handleUserSearch,
  "/profiles/users/card": handleUserCard,
  "/profiles/users/recall": handleUserRecall,
  "/profiles/users/beliefs": handleUserBeliefs,
  "/profiles/users/relationship": handleUserRelationship,
  "/profiles/users/engagement": handleUserEngagement,
  "/profiles/agent": handleAgentProfile,
  "/profiles/users/summary": handleUserSummary,
  "/profiles/summary": handleUserSummary,
  "/profiles/users/context": handleUserContext,
};

export function handleIdentityProfileGetRoute(
  input: IdentityProfileRouteInput,
): Promise<Response | null> | Response | null {
  return GET_ROUTES[input.url.pathname]?.(input) ?? null;
}
