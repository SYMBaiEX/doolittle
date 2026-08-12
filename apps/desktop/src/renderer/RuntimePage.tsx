import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@elizaos/ui/components/ui/tabs";
import { useState } from "react";
import type {
  AccountPoolResponse,
  PluginsResponse,
  RuntimeStatus,
} from "../shared/contracts";
import type { NativeAutonomyResponse } from "./components/NativeAutonomyPanel";
import { PageHeader, type UnknownRecord, useApiResource } from "./lib";
import {
  type GatewayHealthResponse,
  type GatewayRuntimeResponse,
  type RuntimeSection,
  runtimeResourcePolicy,
} from "./runtime/models";
import { RuntimeGateway } from "./runtime/RuntimeGateway";
import { RuntimeInventory } from "./runtime/RuntimeInventory";
import { RuntimeOverview } from "./runtime/RuntimeOverview";
import "./runtime-page.css";

const RUNTIME_SECTIONS: Array<{
  id: RuntimeSection;
  label: string;
  detail: string;
}> = [
  { id: "overview", label: "Overview", detail: "Model, accounts, autonomy" },
  { id: "gateway", label: "Gateway", detail: "Transports and deliveries" },
  { id: "inventory", label: "Inventory", detail: "Plugins and ecosystem" },
];

export function RuntimePage({
  active,
  onOpenProviders,
}: {
  active: boolean;
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
    if (policy.runtime) runtime.reload();
    if (policy.accountPool) accountPool.reload();
    if (policy.autonomy) autonomy.reload();
    if (policy.gatewayHealth) gatewayHealth.reload();
    if (policy.gatewayRuntime) gatewayRuntime.reload();
    if (policy.plugins) plugins.reload();
    if (policy.ecosystem) ecosystem.reload();
    if (policy.insights) insights.reload();
  };

  return (
    <PagePanel className="page studio-page runtime-page" variant="workspace">
      <PageHeader
        eyebrow="Runtime"
        title="Runtime"
        description="Inspect the active model, Eliza-native services, gateway health, and installed capability inventory without loading every diagnostic surface at once."
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
        className="runtime-tabs"
        onValueChange={(value) => setSection(value as RuntimeSection)}
        value={section}
      >
        <TabsList aria-label="Runtime sections" className="runtime-tabs-list">
          {RUNTIME_SECTIONS.map((entry) => (
            <TabsTrigger
              className="runtime-tab"
              key={entry.id}
              value={entry.id}
            >
              <span>{entry.label}</span>
              <small>{entry.detail}</small>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="runtime-panel" value="overview">
          <RuntimeOverview
            accountPool={accountPool}
            autonomy={autonomy}
            onOpenProviders={onOpenProviders}
            runtime={runtime}
          />
        </TabsContent>
        <TabsContent className="runtime-panel" value="gateway">
          <RuntimeGateway
            gatewayHealth={gatewayHealth}
            gatewayRuntime={gatewayRuntime}
          />
        </TabsContent>
        <TabsContent className="runtime-panel" value="inventory">
          <RuntimeInventory
            ecosystem={ecosystem}
            insights={insights}
            plugins={plugins}
          />
        </TabsContent>
      </Tabs>
    </PagePanel>
  );
}
