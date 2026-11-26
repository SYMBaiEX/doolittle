// The shared ws-* narrow layout queries look for a `work` container. Gateway
// owns one itself so its panes stack even when it is embedded in another work surface.
export const GATEWAY_PAGE_CLASS =
  "@container/work gateway-page flex min-h-full w-full min-w-0 flex-col gap-3";
