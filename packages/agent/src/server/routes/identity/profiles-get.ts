import {
  getEffectiveRolodexSummary,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
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
      ? [context.services.userProfiles.get(userId)]
      : context.services.userProfiles.list(),
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
      context.services,
      query,
      getPositiveLimit(url, "limit", 10),
    ),
  });
};

const handleUserCard: IdentityProfileRouteHandler = ({
  context,
  url,
  nativeServices,
}) => {
  const userId = getSearchParam(url, "userId");
  if (!userId) {
    return badRequest("userId is required");
  }

  return json({
    card:
      nativeServices.rolodex?.card(userId) ??
      context.services.userProfiles.renderCards(userId),
    summary: getEffectiveRolodexSummary(context.runtime, context.services),
  });
};

const handleUserRecall: IdentityProfileRouteHandler = ({
  context,
  url,
  nativeServices,
}) => {
  const userId = getSearchParam(url, "userId");
  const query = getSearchParam(url, "query");
  if (!userId || !query) {
    return badRequest("userId and query are required");
  }

  return json({
    hits:
      nativeServices.rolodex?.recall(userId, query) ??
      context.services.userProfiles.recall(userId, query),
  });
};

const handleUserBeliefs: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  if (!userId) {
    return badRequest("userId is required");
  }

  return json({
    beliefs: getEffectiveUserBeliefs(context.runtime, context.services, userId),
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
    relationship: getEffectiveUserRelationship(
      context.runtime,
      context.services,
      userId,
    ),
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
    engagement: getEffectiveUserEngagement(
      context.runtime,
      context.services,
      userId,
    ),
  });
};

const handleAgentProfile: IdentityProfileRouteHandler = ({
  context,
  nativeServices,
}) => {
  const agentProfile =
    nativeServices.rolodex?.agentProfile() ??
    context.services.userProfiles.getAgent();

  return json({
    profile: agentProfile,
    card: agentProfile ?? context.services.userProfiles.renderAgent(),
    summary: getEffectiveRolodexSummary(context.runtime, context.services),
  });
};

const handleUserSummary: IdentityProfileRouteHandler = ({ context }) =>
  json({
    summary: getEffectiveUserProfileSummary(context.runtime, context.services),
  });

const handleUserContext: IdentityProfileRouteHandler = ({ context, url }) => {
  const userId = getSearchParam(url, "userId");
  const query = getSearchParam(url, "query");
  if (!userId || !query) {
    return badRequest("userId and query are required");
  }

  return json({
    context: context.services.userProfiles.context(userId, query),
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
