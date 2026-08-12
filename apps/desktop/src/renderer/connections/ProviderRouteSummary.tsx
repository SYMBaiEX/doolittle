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
    <dl className="provider-route-summary" aria-label="Chat provider status">
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
