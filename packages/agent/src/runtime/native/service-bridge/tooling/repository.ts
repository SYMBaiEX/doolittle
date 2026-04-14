import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeCodingAgent } from "./native-services";

export async function getEffectiveRepositoryStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeCodingAgent(runtime)?.repoStatus()) ??
    services.repository.status()
  );
}

export async function getEffectiveRepositoryDiff(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeCodingAgent(runtime)?.repoDiff()) ??
    services.repository.diffStat()
  );
}

export async function getEffectiveRepositoryLog(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 10,
) {
  return (
    (await getNativeCodingAgent(runtime)?.repoLog(limit)) ??
    services.repository.recentCommits(limit)
  );
}
