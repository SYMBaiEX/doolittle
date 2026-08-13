export function DesktopRouteLoadingFallback({
  label = "view",
}: {
  label?: string;
}) {
  return (
    <div aria-live="polite" className="loading-block" role="status">
      <i aria-hidden="true" />
      <span>Opening {label.toLowerCase()}…</span>
    </div>
  );
}
