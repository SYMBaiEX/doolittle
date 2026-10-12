import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import type { ApiResource } from "../lib";

/** A transient catalog failure must not disable recovery while the backend stays ready. */
export function useBotCatalogPolling(
  backendReady: boolean,
  resource: Pick<
    ApiResource<unknown>,
    "loading" | "status" | "isValidating" | "reload"
  >,
): void {
  useIntervalWhenDocumentVisible(
    () => {
      if (
        resource.loading ||
        resource.isValidating ||
        resource.status === "loading" ||
        resource.status === "refreshing"
      )
        return;
      resource.reload();
    },
    5_000,
    backendReady,
  );
}
