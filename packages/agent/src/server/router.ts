export type RouteHandler<TContext> = (
  context: TContext,
  request: Request,
  url: URL,
) => Promise<Response | null> | Response | null;

/** Load optional API capabilities only when their namespace is requested. */
export function onDemandRoute<TContext>(
  matches: (url: URL) => boolean,
  load: () => Promise<RouteHandler<TContext>>,
): RouteHandler<TContext> {
  let handler: RouteHandler<TContext> | undefined;
  return (context, request, url) => {
    if (!matches(url)) return null;
    request.signal.throwIfAborted();
    if (handler) return handler(context, request, url);
    return load().then((loaded) => {
      handler = loaded;
      request.signal.throwIfAborted();
      return loaded(context, request, url);
    });
  };
}

export async function dispatchRouteHandlers<TContext>(
  context: TContext,
  request: Request,
  url: URL,
  handlers: ReadonlyArray<RouteHandler<TContext>>,
): Promise<Response | null> {
  for (const handler of handlers) {
    const result = handler(context, request, url);
    if (result === null) continue;
    const response = await result;
    if (response) {
      return response;
    }
  }

  return null;
}
