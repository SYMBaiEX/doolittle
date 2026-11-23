import type { AppContext } from "../../../runtime/bootstrap/index";
import type { TrajectoryBundleRecord, TrajectoryDatasetBody } from "./types";

export function buildTrajectoryRequest(body: TrajectoryDatasetBody) {
  return {
    limit: body.limit ?? 200,
    sessionId: body.sessionId,
    role: body.role,
    label: body.label,
    purpose: body.purpose,
    tags: body.tags,
    mode: body.mode,
    notes: body.notes,
  };
}

export function findBundle(
  context: AppContext,
  labelOrPath: string | null | undefined,
): TrajectoryBundleRecord | undefined {
  if (!labelOrPath) {
    return undefined;
  }
  const bundles = context.services.trajectoryEvaluation.listBundles(50);
  return (bundles.find((entry) => entry.label === labelOrPath) ??
    bundles.find((entry) => entry.manifestPath.endsWith(labelOrPath))) as
    | TrajectoryBundleRecord
    | undefined;
}

export function buildPackageRequest(bundle: TrajectoryBundleRecord) {
  return {
    manifestPath: bundle.manifestPath,
  };
}

export async function readJsonBody<T>(
  request: Request,
): Promise<T | undefined> {
  return ((await request.json().catch(() => ({}))) ?? {}) as T | undefined;
}
