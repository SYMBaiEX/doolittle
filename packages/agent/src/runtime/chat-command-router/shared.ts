import type { ChatCommandRouteGroup, ChatCommandRouteState } from "./types";

export async function runCommandRouteGroup(
  state: ChatCommandRouteState,
  routes: ChatCommandRouteGroup,
): Promise<string | undefined> {
  for (const route of routes) {
    const response = await route(state);
    if (response) {
      return response;
    }
  }

  return undefined;
}
