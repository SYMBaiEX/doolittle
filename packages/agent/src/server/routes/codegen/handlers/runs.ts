import { json } from "@/server/responses";
import {
  toPublicAutocoderRun,
  toPublicAutocoderSummary,
} from "@/server/routes/codegen/public-dtos";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";
import { parseOpaqueRouteId } from "@/server/routes/parse-opaque-id";
import { AutocoderArtifactError } from "@/services/autocoder-pipeline";

const PRIVATE_ARTIFACT_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "cross-origin-resource-policy": "same-origin",
  "x-content-type-options": "nosniff",
} as const;

function privateArtifactJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: PRIVATE_ARTIFACT_HEADERS,
  });
}

function parseArtifactRoute(
  pathname: string,
): { runId: string; index: number } | undefined {
  const match = pathname.match(
    /^\/codegen\/runs\/([^/]+)\/artifacts\/([^/]+)$/u,
  );
  if (!match) return undefined;
  let runId: string;
  try {
    runId = decodeURIComponent(match[1] ?? "");
  } catch {
    return undefined;
  }
  const rawIndex = match[2] ?? "";
  if (
    !runId ||
    runId.includes("/") ||
    runId.includes("\\") ||
    !/^(0|[1-9]\d*)$/u.test(rawIndex)
  ) {
    return undefined;
  }
  const index = Number(rawIndex);
  return Number.isSafeInteger(index) ? { runId, index } : undefined;
}

function cancellationReceipt(input: {
  applied: boolean;
  alreadyCancelled: boolean;
  locallyActive: boolean;
  executionTerminationSupported: boolean;
  executionTerminated: boolean;
}) {
  return {
    requested: true,
    applied: input.applied,
    alreadyCancelled: input.alreadyCancelled,
    locallyActive: input.locallyActive,
    executionTerminationSupported: input.executionTerminationSupported,
    executionTerminated: input.executionTerminated,
    note: input.executionTerminated
      ? "The active local execution was aborted and the cancelled lifecycle was persisted."
      : "No active local execution was found. The cancelled lifecycle was persisted without claiming that remote or detached work was terminated.",
  };
}

export const handleCodegenRunsRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  const cancelMatch = url.pathname.match(/^\/codegen\/runs\/([^/]+)\/cancel$/u);
  if (cancelMatch && request.method === "POST") {
    const id = parseOpaqueRouteId(cancelMatch[1]);
    if (!id) {
      return json({ error: "Autocoder run identifier is invalid." }, 400);
    }

    const run = context.services.autocoderPipeline.get(id);
    if (!run) {
      return json({ error: "Autocoder pipeline run not found." }, 404);
    }
    if (run.status === "cancelled") {
      return json({
        run: toPublicAutocoderRun(run),
        cancellation: cancellationReceipt({
          applied: false,
          alreadyCancelled: true,
          locallyActive: false,
          executionTerminationSupported: true,
          executionTerminated: false,
        }),
      });
    }
    if (run.status !== "pending" && run.status !== "running") {
      return json(
        {
          error: `Autocoder pipeline run is already ${run.status} and cannot be cancelled.`,
          run: toPublicAutocoderRun(run),
        },
        409,
      );
    }

    const cancellation = context.services.autocoderPipeline.cancelRunExecution(
      id,
      "cancelled by API request",
    );
    return json({
      run: toPublicAutocoderRun(cancellation.run),
      cancellation: cancellationReceipt(cancellation),
    });
  }

  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/codegen/runs") {
    return json({
      summary: toPublicAutocoderSummary(
        context.services.autocoderPipeline.summary(),
      ),
      runs: context.services.autocoderPipeline
        .list(50)
        .map(toPublicAutocoderRun),
    });
  }

  const artifactRoute = parseArtifactRoute(url.pathname);
  if (artifactRoute) {
    try {
      return privateArtifactJson(
        context.services.autocoderPipeline.readArtifact(
          artifactRoute.runId,
          artifactRoute.index,
        ),
      );
    } catch (error) {
      if (error instanceof AutocoderArtifactError) {
        return privateArtifactJson({ error: error.message }, error.status);
      }
      return privateArtifactJson(
        { error: "Autocoder artifact could not be read." },
        500,
      );
    }
  }
  if (/^\/codegen\/runs\/[^/]+\/artifacts(?:\/|$)/u.test(url.pathname)) {
    return privateArtifactJson(
      { error: "Autocoder artifact identifier is invalid." },
      400,
    );
  }

  const runMatch = url.pathname.match(/^\/codegen\/runs\/([^/]+)$/u);
  if (runMatch) {
    const id = parseOpaqueRouteId(runMatch[1]);
    if (!id) {
      return json({ error: "Autocoder run identifier is invalid." }, 400);
    }
    const run = context.services.autocoderPipeline.get(id);
    return json({
      run: run ? toPublicAutocoderRun(run) : undefined,
    });
  }

  return null;
};
