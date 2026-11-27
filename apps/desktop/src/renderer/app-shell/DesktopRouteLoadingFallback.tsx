import { LoadingBlock } from "../lib";

export function DesktopRouteLoadingFallback({
  label = "view",
}: {
  label?: string;
}) {
  return <LoadingBlock label={`Opening ${label.toLowerCase()}…`} />;
}
