import { json } from "@/server/responses";
import {
  buildPackageRequest,
  buildTrajectoryRequest,
  findBundle,
  readJsonBody,
} from "./helpers";
import type { TrajectoryDatasetBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryEvaluationRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (request.method === "POST" && url.pathname === "/trajectories/evaluate") {
    const body = await readJsonBody<
      TrajectoryDatasetBody & { rubric?: string[] }
    >(request);
    return json({
      evaluation: await context.services.trajectories.evaluate({
        ...buildTrajectoryRequest(body ?? {}),
        rubric: body?.rubric,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/trajectories/evaluate") {
    const manifestPath = url.searchParams.get("manifestPath");
    const label = url.searchParams.get("label");
    const latest = url.searchParams.get("latest") === "true";
    if (latest) {
      const evaluation = await context.services.trajectories.evaluateLatest();
      return evaluation
        ? json({ evaluation })
        : json({ error: "No trajectory bundles recorded." }, 404);
    }
    if (manifestPath) {
      return json({
        evaluation:
          await context.services.trajectories.evaluateBundle(manifestPath),
      });
    }
    if (label) {
      const bundle = findBundle(context, label);
      if (!bundle) {
        return json({ error: "Trajectory bundle not found." }, 404);
      }
      return json({
        evaluation: await context.services.trajectories.evaluateBundle(
          bundle.manifestPath,
        ),
      });
    }
    return json(
      { error: "manifestPath, label, or latest=true is required" },
      400,
    );
  }

  if (request.method === "POST" && url.pathname === "/trajectories/package") {
    const body = await readJsonBody<
      TrajectoryDatasetBody & { rubric?: string[] }
    >(request);
    return json({
      package: await context.services.trajectories.package({
        ...buildTrajectoryRequest(body ?? {}),
        rubric: body?.rubric,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/trajectories/package") {
    const manifestPath = url.searchParams.get("manifestPath");
    const label = url.searchParams.get("label");
    const latest = url.searchParams.get("latest") === "true";
    if (latest) {
      const packaged = await context.services.trajectories.packageLatest();
      return packaged
        ? json({ package: packaged })
        : json({ error: "No trajectory bundles recorded." }, 404);
    }
    if (manifestPath) {
      const bundle = context.services.trajectories.describeBundle(
        manifestPath,
      ) as Parameters<typeof buildPackageRequest>[0];
      return json({
        package: await context.services.trajectories.package(
          buildPackageRequest(bundle),
        ),
      });
    }
    if (label) {
      const bundle = findBundle(context, label);
      if (!bundle) {
        return json({ error: "Trajectory bundle not found." }, 404);
      }
      return json({
        package: await context.services.trajectories.package(
          buildPackageRequest(bundle),
        ),
      });
    }
    return json(
      { error: "manifestPath, label, or latest=true is required" },
      400,
    );
  }

  return null;
};
