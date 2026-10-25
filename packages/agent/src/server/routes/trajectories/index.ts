import type { AppContext } from "../../../runtime/bootstrap/index";
import { TrajectoryInputError } from "../../../services/trajectory/bundle-storage/safe-read";
import { json } from "../../responses";
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
    let response: Response | null;
    try {
      response = await handler(context, request, url);
    } catch (error) {
      if (error instanceof TrajectoryInputError) {
        return json({ error: error.message }, error.status);
      }
      throw error;
    }
    if (response) {
      return response;
    }
  }
  return null;
}
