export function DesktopRouteLoadingFallback() {
  return (
    <div aria-live="polite" className="loading-block" role="status">
      <i aria-hidden="true" />
      <span>Opening workspace…</span>
    </div>
  );
}
