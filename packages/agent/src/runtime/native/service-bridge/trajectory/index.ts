import { getNativeServices } from "../runtime";
import type {
  NativeTrajectoryLoggerService,
  RuntimeLike,
} from "../runtime-contracts";

export class NativeTrajectoryLoggerUnavailableError extends Error {
  readonly code = "NATIVE_TRAJECTORY_LOGGER_UNAVAILABLE";

  constructor() {
    super(
      "The required Eliza trajectories service is unavailable. Canonical model and tool trajectories require the SDK-owned logger.",
    );
    this.name = "NativeTrajectoryLoggerUnavailableError";
  }
}

export function requireNativeTrajectoryLogger(
  runtime: RuntimeLike,
): NativeTrajectoryLoggerService {
  const service = getNativeServices(runtime).trajectoryLogger;
  if (!service) {
    throw new NativeTrajectoryLoggerUnavailableError();
  }
  return service;
}
