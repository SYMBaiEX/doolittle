import { dispatchRoute } from "@elizaos/agent/api/dispatch-route";
import type { IAgentRuntime, RouteHandlerResult } from "@elizaos/core";

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, name) => {
    record[name.toLowerCase()] = value;
  });
  return record;
}

function searchParamsToQuery(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const name of new Set(searchParams.keys())) {
    const values = searchParams.getAll(name);
    query[name] = values.length === 1 ? (values[0] ?? "") : values;
  }
  return query;
}

async function readRequestBody(
  request: Request,
): Promise<{ body?: unknown; rawBody?: string }> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const rawBody = await request.text();
  if (!rawBody.trim()) return { rawBody };
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return { body: rawBody, rawBody };
  }
  try {
    return { body: JSON.parse(rawBody), rawBody };
  } catch {
    return { body: rawBody, rawBody };
  }
}

function iterableBody(
  iterable: AsyncIterable<string | Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = iterable[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(
        typeof next.value === "string"
          ? encoder.encode(next.value)
          : next.value,
      );
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

function resultToResponse(result: RouteHandlerResult): Response {
  const headers = new Headers(result.headers ?? {});
  if (!headers.has("access-control-allow-origin")) {
    headers.set("access-control-allow-origin", "*");
  }
  if (result.stream) {
    return new Response(iterableBody(result.stream), {
      status: result.status,
      headers,
    });
  }

  let body: BodyInit | null = null;
  if (typeof result.body === "string") {
    body = result.body;
    if (!headers.has("content-type")) {
      headers.set("content-type", "text/plain; charset=utf-8");
    }
  } else if (result.body instanceof Uint8Array) {
    body = Uint8Array.from(result.body).buffer;
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/octet-stream");
    }
  } else if (result.body !== undefined && result.body !== null) {
    body = JSON.stringify(result.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json; charset=utf-8");
    }
  }

  return new Response(body, { status: result.status, headers });
}

export async function dispatchRuntimePluginRoute({
  runtime,
  request,
  url,
  isAuthorized,
}: {
  runtime: IAgentRuntime;
  request: Request;
  url: URL;
  isAuthorized: () => boolean;
}): Promise<Response | null> {
  const { body, rawBody } = await readRequestBody(request.clone());
  const result = await dispatchRoute({
    runtime,
    method: request.method,
    path: url.pathname,
    headers: headersToRecord(request.headers),
    query: searchParamsToQuery(url.searchParams),
    body,
    rawBody,
    inProcess: false,
    isAuthorized,
  });
  return result ? resultToResponse(result) : null;
}
