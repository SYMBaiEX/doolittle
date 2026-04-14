import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { TrajectoryBundleRecord, TrajectoryDatasetBody } from "./types";

export function getTrajectoryLogger(context: AppContext) {
  return getNativeServices(context.runtime).trajectoryLogger;
}

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
  return context.services.trajectories
    .listBundles(50)
    .find(
      (entry) =>
        entry.label === labelOrPath || entry.manifestPath.endsWith(labelOrPath),
    ) as TrajectoryBundleRecord | undefined;
}

export function buildPackageRequest(bundle: TrajectoryBundleRecord) {
  return {
    limit: bundle.limit,
    sessionId: bundle.filters?.sessionId ?? undefined,
    role: bundle.filters?.role ?? undefined,
    label: bundle.label,
    purpose: bundle.purpose,
    mode: bundle.mode,
    tags: bundle.tags,
    notes: bundle.notes,
  };
}

export async function readJsonBody<T>(
  request: Request,
): Promise<T | undefined> {
  return ((await request.json().catch(() => ({}))) ?? {}) as T | undefined;
}
