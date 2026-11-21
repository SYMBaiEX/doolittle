import { addAbortListener } from "node:events";
import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../services/index";
import { appendBootstrapTrace } from "../trace";

const MAX_PLUGIN_ATTEMPTS = 3;
const supportServices = [
  "diagnostics",
  "operator",
  "ecosystem",
  "skills",
] as const;

interface PluginAttempt {
  failures: number;
  registered: boolean;
}

export function createDeferredHydrator(params: {
  services: Pick<
    AppServices,
    "startupState" | "logger" | (typeof supportServices)[number]
  >;
  loadTurnPlugins(): Promise<Plugin[]>;
  loadMessagingPlugins(): Promise<Plugin[]>;
  registerTurnPlugin(plugin: Plugin): Promise<void>;
  registerMessagingPlugin(plugin: Plugin): Promise<void>;
  ensureGateway(): void;
  startScheduler(): Promise<void>;
}) {
  const { startupState, logger } = params.services;

  function createPluginPhase(
    phase: "tools" | "messaging",
    loadPlugins: () => Promise<Plugin[]>,
    registerPlugin: (plugin: Plugin) => Promise<void>,
  ) {
    const attempts = new Map<Plugin, PluginAttempt>();
    let plugins: Plugin[] | undefined;
    let pending: Promise<void> | undefined;
    let settled = false;

    return (registrationReady?: Promise<void>): Promise<void> => {
      if (settled) return Promise.resolve();
      if (pending) return pending;
      pending = Promise.resolve()
        .then(async () => {
          startupState.markWarming(phase, `loading ${phase} plugins`);
          try {
            if (!plugins) {
              appendBootstrapTrace(`phase:${phase}:imports:start`);
              plugins = await loadPlugins();
              appendBootstrapTrace(`phase:${phase}:imports:done`);
            }
          } catch {
            appendBootstrapTrace(`phase:${phase}:imports:error`);
            startupState.markError(phase, `Could not load ${phase} plugins.`);
            logger.warn("deferred-plugin-load-failed", { phase });
            return;
          }

          await registrationReady;
          const unavailable: string[] = [];
          for (const plugin of plugins) {
            const attempt = attempts.get(plugin) ?? {
              failures: 0,
              registered: false,
            };
            attempts.set(plugin, attempt);
            if (attempt.registered) continue;
            if (attempt.failures < MAX_PLUGIN_ATTEMPTS) {
              try {
                appendBootstrapTrace(
                  `phase:${phase}:registration:start`,
                  plugin.name,
                );
                await registerPlugin(plugin);
                appendBootstrapTrace(
                  `phase:${phase}:registration:done`,
                  plugin.name,
                );
                attempt.registered = true;
                continue;
              } catch {
                appendBootstrapTrace(
                  `phase:${phase}:registration:error`,
                  plugin.name,
                );
                attempt.failures += 1;
                logger.warn("deferred-plugin-registration-failed", {
                  phase,
                  plugin: plugin.name,
                  attempt: attempt.failures,
                  limit: MAX_PLUGIN_ATTEMPTS,
                });
              }
            }
            unavailable.push(plugin.name);
          }

          const ready = unavailable.length === 0;
          settled =
            ready ||
            [...attempts.values()].every(
              ({ failures, registered }) =>
                registered || failures >= MAX_PLUGIN_ATTEMPTS,
            );
          if (ready) {
            startupState.markReady(phase, `${phase} plugins registered`);
          } else {
            startupState.markError(
              phase,
              `Unavailable ${phase} plugins: ${unavailable.join(", ")}`,
            );
          }
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    };
  }

  const warmTurnPlugins = createPluginPhase(
    "tools",
    params.loadTurnPlugins,
    params.registerTurnPlugin,
  );
  const warmMessagingPlugins = createPluginPhase(
    "messaging",
    params.loadMessagingPlugins,
    params.registerMessagingPlugin,
  );
  let hydration: Promise<void> | undefined;

  async function ensureTurnPlugins(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const warming = warmTurnPlugins();
    if (!signal) {
      await warming;
      return;
    }
    let listener: ReturnType<typeof addAbortListener> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      listener = addAbortListener(signal, () => reject(signal.reason));
    });
    try {
      await Promise.race([warming, cancelled]);
    } finally {
      listener?.[Symbol.dispose]();
    }
  }

  async function warmSessionMaintenance(reason?: string): Promise<void> {
    if (startupState.getSnapshot().phases.cron.status === "ready") return;
    startupState.markWarming(
      "cron",
      reason ? `starting scheduler (${reason})` : "starting scheduler",
    );
    try {
      await params.startScheduler();
      startupState.markReady("cron", "scheduler ready");
    } catch (error) {
      startupState.markError("cron", "Session maintenance could not start.");
      throw error;
    }
  }

  async function hydrate(reason?: string): Promise<void> {
    const turnToolsReady = ensureTurnPlugins();
    const gatewayReady = turnToolsReady.then(() => params.ensureGateway());

    // Import configured connectors while tools warm up. Start live ingress
    // only after the gateway and turn tools can handle incoming messages.
    const results = await Promise.allSettled([
      Promise.all([gatewayReady, warmMessagingPlugins(gatewayReady)]),
      turnToolsReady.then(() => warmSessionMaintenance(reason)),
      ...supportServices.map((service) =>
        turnToolsReady.then(() => params.services[service]),
      ),
    ]);
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Startup services could not be warmed.",
      );
    }
  }

  function ensureDeferredHydration(reason?: string): Promise<void> {
    if (startupState.getSnapshot().deferredReady) return Promise.resolve();
    hydration ??= hydrate(reason).finally(() => {
      hydration = undefined;
    });
    return hydration;
  }

  return { ensureTurnPlugins, ensureDeferredHydration };
}
