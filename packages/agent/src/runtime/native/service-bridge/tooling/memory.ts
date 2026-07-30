import type { SessionSearchResult } from "@/types";
import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeMemoryStorage } from "./native-services";

export function searchNativeSessions(
  runtime: RuntimeLike,
  query: string,
  limit: number,
): SessionSearchResult[] {
  return requireNativeMemoryStorage(runtime).searchSessions(query, limit);
}
