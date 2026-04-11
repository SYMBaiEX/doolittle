export type RouteHandler<TContext> = (
  context: TContext,
  request: Request,
  url: URL,
) => Promise<Response | null> | Response | null;

export async function dispatchRouteHandlers<TContext>(
  context: TContext,
  request: Request,
  url: URL,
  handlers: ReadonlyArray<RouteHandler<TContext>>,
): Promise<Response | null> {
  for (const handler of handlers) {
    const response = await handler(context, request, url);
    if (response) {
      return response;
    }
  }

  return null;
}
