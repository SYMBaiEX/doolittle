import { Button } from "@elizaos/ui/button";
import { Tabs, TabsContent } from "@elizaos/ui/components/ui/tabs";
import { type ReactNode, useState } from "react";
import type {
  AccountPoolResponse,
  PluginsResponse,
  RuntimeStatus,
} from "../shared/contracts";
import type { NativeAutonomyResponse } from "./components/NativeAutonomyPanel";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { type UnknownRecord, useApiResource } from "./lib";
import {
  type GatewayHealthResponse,
  type GatewayRuntimeResponse,
  type RuntimeSection,
  runtimeResourcePolicy,
} from "./runtime/models";
import { RuntimeGateway } from "./runtime/RuntimeGateway";
import { RuntimeInventory } from "./runtime/RuntimeInventory";
import { RuntimeOverview } from "./runtime/RuntimeOverview";
import { RuntimeSectionNav } from "./runtime-state/RuntimeSectionNav";

const RUNTIME_SECTIONS: Array<{
  id: RuntimeSection;
  label: string;
  detail: string;
}> = [
  { id: "overview", label: "Overview", detail: "Model, accounts, autonomy" },
  { id: "gateway", label: "Gateway", detail: "Transports and deliveries" },
  { id: "inventory", label: "Inventory", detail: "Plugins and ecosystem" },
];

function RuntimePageFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="settings-embedded-section @container/runtime min-w-0"
      data-settings-embedded="true"
    >
      {children}
    </div>
  );
}

function RuntimePageHeader({ actions }: { actions: ReactNode }) {
  return (
    <header className="settings-section-header">
      <div>
        <span className="eyebrow">Runtime</span>
        <h2>Runtime</h2>
        <p>Inspect the model, services, gateway, and capabilities.</p>
      </div>
      {actions}
    </header>
  );
}

export function RuntimePage({
  active,
  readOnly = false,
  onOpenProviders,
}: {
  active: boolean;
  readOnly?: boolean;
  onOpenProviders?: () => void;
}) {
  const [section, setSection] = useState<RuntimeSection>("overview");
  const policy = runtimeResourcePolicy(section, active);
  const runtime = useApiResource<RuntimeStatus>(
    policy.runtime ? "/runtime/status" : null,
    [policy.runtime],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    policy.accountPool ? "/runtime/account-pool" : null,
    [policy.accountPool],
  );
  const autonomy = useApiResource<NativeAutonomyResponse>(
    policy.autonomy ? "/autonomy/status" : null,
    [policy.autonomy],
  );
  const gatewayHealth = useApiResource<GatewayHealthResponse>(
    policy.gatewayHealth ? "/gateway/health" : null,
    [policy.gatewayHealth],
  );
  const gatewayRuntime = useApiResource<GatewayRuntimeResponse>(
    policy.gatewayRuntime ? "/gateway/runtime" : null,
    [policy.gatewayRuntime],
  );
  const plugins = useApiResource<PluginsResponse>(
    policy.plugins ? "/runtime/plugins?view=catalog" : null,
    [policy.plugins],
  );
  const ecosystem = useApiResource<UnknownRecord>(
    policy.ecosystem ? "/runtime/ecosystem" : null,
    [policy.ecosystem],
  );
  const insights = useApiResource<UnknownRecord>(
    policy.insights ? "/insights" : null,
    [policy.insights],
  );

  const reloadVisibleSection = () => {
    if (!active) return;
    if (policy.runtime) runtime.reload();
    if (policy.accountPool) accountPool.reload();
    if (policy.autonomy) autonomy.reload();
    if (policy.gatewayHealth) gatewayHealth.reload();
    if (policy.gatewayRuntime) gatewayRuntime.reload();
    if (policy.plugins) plugins.reload();
    if (policy.ecosystem) ecosystem.reload();
    if (policy.insights) insights.reload();
  };

  if (!active) {
    return (
      <RuntimePageFrame>
        <RuntimePageHeader
          actions={
            <Button
              className="text-button"
              disabled
              onClick={reloadVisibleSection}
              type="button"
              variant="ghost"
            >
              Refresh
            </Button>
          }
        />
        <OfflineRouteState>
          Runtime diagnostics and capability inventory are unavailable until the
          local runtime is ready.
        </OfflineRouteState>
      </RuntimePageFrame>
    );
  }

  return (
    <RuntimePageFrame>
      <RuntimePageHeader
        actions={
          <Button
            className="text-button"
            disabled={!active}
            onClick={reloadVisibleSection}
            type="button"
            variant="ghost"
          >
            Refresh{" "}
            {RUNTIME_SECTIONS.find((entry) => entry.id === section)?.label}
          </Button>
        }
      />

      <Tabs
        className="grid min-h-0 gap-3"
        onValueChange={(value) => setSection(value as RuntimeSection)}
        value={section}
      >
        <RuntimeSectionNav
          ariaLabel="Runtime sections"
          sections={RUNTIME_SECTIONS}
        />

        <TabsContent className="min-h-0" value="overview">
          <RuntimeOverview
            active={active}
            accountPool={accountPool}
            autonomy={autonomy}
            onOpenProviders={onOpenProviders}
            runtime={runtime}
            readOnly={readOnly}
          />
        </TabsContent>
        <TabsContent className="min-h-0" value="gateway">
          <RuntimeGateway
            active={active}
            gatewayHealth={gatewayHealth}
            gatewayRuntime={gatewayRuntime}
          />
        </TabsContent>
        <TabsContent className="min-h-0" value="inventory">
          <RuntimeInventory
            active={active}
            ecosystem={ecosystem}
            insights={insights}
            plugins={plugins}
          />
        </TabsContent>
      </Tabs>
    </RuntimePageFrame>
  );
}
