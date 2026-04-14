import type {
  IdentityProfileRouteHandler,
  IdentityProfileRouteInput,
} from "../profiles-shared";
import { handleAgentObserve } from "./agent-observe";
import { handleAgentSeed } from "./agent-seed";
import { handleUserConclude } from "./user-conclude";
import { handleUserMode } from "./user-mode";
import { handleUserModeling } from "./user-modeling";
import { handleUserNote } from "./user-note";
import { handleUserRemember } from "./user-remember";

const POST_ROUTES: Record<string, IdentityProfileRouteHandler> = {
  "/profiles/users/note": handleUserNote,
  "/profiles/users/remember": handleUserRemember,
  "/profiles/users/mode": handleUserMode,
  "/profiles/users/modeling": handleUserModeling,
  "/profiles/users/conclude": handleUserConclude,
  "/profiles/agent/observe": handleAgentObserve,
  "/profiles/agent/seed": handleAgentSeed,
};

export function handleIdentityProfilePostRoute(
  input: IdentityProfileRouteInput,
): Promise<Response | null> | Response | null {
  return POST_ROUTES[input.url.pathname]?.(input) ?? null;
}
