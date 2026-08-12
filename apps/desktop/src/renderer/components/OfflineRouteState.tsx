import type { ReactNode } from "react";
import { EmptyBlock } from "../lib";

/**
 * Shared compact state for routes that cannot safely query or mutate the local
 * runtime. Keeping this in one place prevents each page from inventing a
 * different offline message or expanding a dead-end state into a full card.
 */
export function OfflineRouteState({
  children = "Restart the local runtime, then try this view again.",
  title = "Local runtime is offline",
}: {
  children?: ReactNode;
  title?: string;
}) {
  return (
    <EmptyBlock density="compact" title={title}>
      {children}
    </EmptyBlock>
  );
}
