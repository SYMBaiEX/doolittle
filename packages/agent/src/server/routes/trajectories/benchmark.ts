import { json } from "@/server/responses";
import { readJsonBody } from "./helpers";
import type {
  TrajectoryBenchmarkCreateBody,
  TrajectoryRouteHandler,
} from "./types";

export const handleTrajectoryBenchmarkRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (
    request.method === "GET" &&
    url.pathname === "/trajectories/benchmark/environment"
  ) {
    return json({
      environment: context.services.trajectories.describeBenchmarkEnvironment(),
    });
  }

  if (request.method === "GET" && url.pathname === "/trajectories/benchmarks") {
    return json({
      benchmarks: context.services.trajectories.listBenchmarkManifests(
        Number(url.searchParams.get("limit") ?? "20"),
      ),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/trajectories/benchmark/create"
  ) {
    const body = await readJsonBody<TrajectoryBenchmarkCreateBody>(request);
    if (!body?.cases?.length) {
      return json({ error: "At least one benchmark case is required" }, 400);
    }
    return json({
      benchmark: context.services.trajectories.createBenchmarkManifest({
        label: body.label,
        purpose: body.purpose,
        tags: body.tags,
        rubric: body.rubric,
        group: body.group,
        cases: body.cases,
      }),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/trajectories/benchmark/run"
  ) {
    const body = await readJsonBody<{
      manifestPath?: string;
      latest?: boolean;
    }>(request);
    if (body?.latest) {
      const run = await context.services.trajectories.runLatestBenchmark();
      return run
        ? json({ benchmark: run })
        : json({ error: "No trajectory benchmark manifests recorded." }, 404);
    }
    if (!body?.manifestPath) {
      return json({ error: "manifestPath is required" }, 400);
    }
    return json({
      benchmark: await context.services.trajectories.runBenchmark(
        body.manifestPath,
      ),
    });
  }

  return null;
};
