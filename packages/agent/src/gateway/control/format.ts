import type { TransportDrilldown } from "./drilldown";

function formatTransportField(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "n/a";
  }
  return String(value);
}

export function formatTransportDrilldown(
  drilldown: TransportDrilldown,
): string {
  const {
    platform,
    inventory,
    bridge,
    runtime,
    gateway,
    plugin,
    controlPlane,
  } = drilldown;

  if (!inventory) {
    return `Transport ${platform} was not found in the canonical inventory.`;
  }

  return [
    `{bold}Transport Drill-Down{/} ${platform}`,
    `Inventory: source=${inventory.source} config=${inventory.configEnabled} gateway=${inventory.gatewayEnabled} operational=${inventory.operational} reason=${inventory.reason}`,
    `Detail: ${inventory.detail}`,
    `Plugin: ${formatTransportField(inventory.pluginId)} service=${formatTransportField(inventory.serviceName)} available=${formatTransportField(inventory.serviceAvailable)}`,
    bridge
      ? `Bridge: config=${bridge.configEnabled} gateway=${bridge.gatewayEnabled} service=${formatTransportField(bridge.serviceName)} available=${formatTransportField(bridge.serviceAvailable)} live=${bridge.live} plugin=${formatTransportField(bridge.pluginId)} reason=${bridge.reason}`
      : "Bridge: n/a",
    runtime
      ? `Runtime control: operational=${runtime.transportControl.operationalTransports}/${controlPlane.transportInventory.length} live=${runtime.transportControl.liveServices}/${runtime.transportControl.gatewayEnabled} pluginEnabled=${runtime.transportControl.enabledPlugins}`
      : "Runtime control: n/a",
    runtime?.transportInventory
      ? `Runtime inventory: source=${runtime.transportInventory.source} config=${runtime.transportInventory.configEnabled} gateway=${runtime.transportInventory.gatewayEnabled} operational=${runtime.transportInventory.operational} reason=${runtime.transportInventory.reason}`
      : "Runtime inventory: n/a",
    gateway?.health
      ? `Gateway health: status=${gateway.health.status} ready=${gateway.health.ready} mode=${gateway.health.mode} sends=${formatTransportField(gateway.health.sendCount)} detail=${gateway.health.detail}`
      : "Gateway health: n/a",
    gateway?.state
      ? `Gateway state: transportState=${gateway.state.transportState} presence=${gateway.state.presence.status} send=${gateway.state.sendCount} recv=${gateway.state.receiveCount} route=${gateway.state.routeCount} resp=${gateway.state.respondCount} traces=${gateway.state.traceCount}`
      : "Gateway state: n/a",
    gateway?.summary ? `Summary: ${gateway.summary}` : "Summary: n/a",
    gateway?.state?.lastEventKind
      ? `Last event: ${gateway.state.lastEventKind} :: ${gateway.state.lastEventDetail ?? "n/a"}`
      : "Last event: n/a",
    gateway?.detail
      ? `History: traces=${gateway.detail.traceCount} inbox=${gateway.detail.inboxCount} outbox=${gateway.detail.outboxCount} attachments=${gateway.detail.attachmentCount}`
      : "History: n/a",
    gateway?.detail
      ? `Mismatches: ${gateway.detail.mismatchFlags.length ? gateway.detail.mismatchFlags.join(", ") : "none"}`
      : "Mismatches: n/a",
    plugin
      ? `Native plugin: ${plugin.id} source=${plugin.source} enabled=${plugin.enabled} :: ${plugin.notes}`
      : "Native plugin: n/a",
  ].join("\n");
}
