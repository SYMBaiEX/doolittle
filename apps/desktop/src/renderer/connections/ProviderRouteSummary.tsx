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
        <dt>New chats</dt>
        <dd>{activeProvider ?? "No provider selected"}</dd>
      </div>
      <div>
        <dt>Providers ready</dt>
        <dd>
          {ready}/{total}
        </dd>
      </div>
    </dl>
  );
}
