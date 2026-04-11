import type { AppContext } from "@/runtime/bootstrap";
import { handleTrajectoryBatchRoutes } from "./batch";
import { handleTrajectoryBenchmarkRoutes } from "./benchmark";
import { handleTrajectoryComparisonRoutes } from "./compare";
import { handleTrajectoryCompressRoutes } from "./compress";
import { handleTrajectoryDatasetRoutes } from "./dataset";
import { handleTrajectoryEvaluationRoutes } from "./evaluation";
import { handleTrajectoryIngestRoutes } from "./ingest";
import { handleTrajectoryReplayRoutes } from "./replay";

const trajectoryRouteHandlers = [
  handleTrajectoryDatasetRoutes,
  handleTrajectoryReplayRoutes,
  handleTrajectoryComparisonRoutes,
  handleTrajectoryCompressRoutes,
  handleTrajectoryIngestRoutes,
  handleTrajectoryBatchRoutes,
  handleTrajectoryEvaluationRoutes,
  handleTrajectoryBenchmarkRoutes,
];

export async function handleTrajectoryRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  for (const handler of trajectoryRouteHandlers) {
    const response = await handler(context, request, url);
    if (response) {
      return response;
    }
  }
  return null;
}
