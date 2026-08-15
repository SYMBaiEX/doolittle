export function ProviderRouteSummary({
  activeProvider,
  ready,
  total,
}: {
  activeProvider?: string;
  ready: number;
  total: number;
}) {
  return (
    <dl
      className={PROVIDER_ROUTE_SUMMARY_CLASS}
      aria-label="Chat provider status"
    >
      <div>
        <dt>Ready</dt>
        <dd>
          {ready}/{total}
        </dd>
      </div>
      <div>
        <dt>New chats</dt>
        <dd>{activeProvider ?? "Choose provider"}</dd>
      </div>
    </dl>
  );
}

import { PROVIDER_ROUTE_SUMMARY_CLASS } from "./layout";
