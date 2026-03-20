import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { authorizeMessage } from "./authorization";
import type { PlatformAdapter, PlatformHealth } from "./platforms/base";
import { DiscordPlatformAdapter } from "./platforms/discord-adapter";
import { MockPlatformAdapter } from "./platforms/mock-adapter";
import { SlackPlatformAdapter } from "./platforms/slack-adapter";
import { TelegramPlatformAdapter } from "./platforms/telegram-adapter";
import { WhatsAppPlatformAdapter } from "./platforms/whatsapp-adapter";
import type { IncomingPlatformMessage, PlatformName } from "@/types";

export class GatewayRunner {
  private readonly adapters = new Map<PlatformName, PlatformAdapter>();
  private running = false;

  constructor(private readonly context: AppContext) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const gatewayConfig = loadGatewayConfig(this.context.config);
    for (const [platform, platformConfig] of Object.entries(gatewayConfig.platforms)) {
      if (!platformConfig.enabled) {
        continue;
      }

      const adapter = this.createAdapter(platform as PlatformName);
      await adapter.start();
      this.adapters.set(platform as PlatformName, adapter);
    }

    this.running = true;
    await this.context.services.hooks.emit("gateway:startup", {
      platforms: Array.from(this.adapters.keys()).join(","),
    });
  }

  private createAdapter(platform: PlatformName): PlatformAdapter {
    if (platform === "telegram") {
      return new TelegramPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "discord") {
      return new DiscordPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "slack") {
      return new SlackPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }
    if (platform === "whatsapp") {
      return new WhatsAppPlatformAdapter(
        platform,
        this.context.config,
        this.context.services.delivery,
      );
    }

    return new MockPlatformAdapter(platform, this.context.services.delivery);
  }

  async stop(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
    this.adapters.clear();
    this.running = false;
    await this.context.services.hooks.emit("gateway:shutdown", {
      status: "stopped",
    });
  }

  async receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response: string;
    pairingCode?: string;
  }> {
    const adapter = this.adapters.get(message.platform);
    if (adapter && !adapter.canReceive()) {
      return {
        ok: false,
        response: `${message.platform} transport is not ready for inbound traffic.`,
      };
    }

    const gatewayConfig = loadGatewayConfig(this.context.config);
    const auth = authorizeMessage(message, gatewayConfig, this.context.services.pairing);
    if (!auth.allowed) {
      const response = auth.pairingCode
        ? `Authorization required. Pairing code: ${auth.pairingCode}`
        : auth.reason ?? "Unauthorized";

      await this.context.services.hooks.emit("gateway:unauthorized", {
        platform: message.platform,
        userId: message.userId,
        pairingCode: auth.pairingCode ?? "",
      });
      return {
        ok: false,
        response,
        pairingCode: auth.pairingCode,
      };
    }

    const session = this.context.services.gatewaySessions.resolve(message);
    await this.context.services.hooks.emit("session:start", {
      platform: message.platform,
      userId: message.userId,
      sessionId: session.sessionKey,
    });

    const response = await handleAgentTurn(
      {
        message: message.text,
        userId: message.userId,
        roomId: session.sessionKey,
        source: message.platform,
      },
      this.context,
    );

    if (adapter) {
      await adapter.send({
        roomId: message.channelId ?? message.roomId,
        userId: message.userId,
        text: response,
      });
    } else {
      this.context.services.delivery.deliver(
        {
          platform: message.platform,
          channelId: message.channelId ?? message.roomId,
          userId: message.userId,
          mode: "origin",
        },
        response,
      );
    }

    await this.context.services.hooks.emit("agent:end", {
      platform: message.platform,
      userId: message.userId,
      sessionId: session.sessionKey,
      response,
    });

    return {
      ok: true,
      response,
    };
  }

  async health(): Promise<
    Array<PlatformHealth>
  > {
    const configuredPlatforms = Object.keys(this.context.services.gatewayConfig.platforms) as PlatformName[];
    const known = new Set(this.adapters.keys());
    const startedHealth = await Promise.all(
      Array.from(this.adapters.values()).map((adapter) => adapter.health()),
    );
    const inactiveHealth: PlatformHealth[] = configuredPlatforms
      .filter((platform) => !known.has(platform))
      .map((platform) => ({
        platform,
        status: "stopped",
        ready: false,
        mode: platform === "telegram" ? "native" : "mock",
        capabilities: {
          inbound: true,
          outbound: true,
          pairing: true,
          attachments: platform === "telegram",
        },
        detail: this.context.services.gatewayConfig.platforms[platform].enabled
          ? "Platform is enabled but the adapter is not running."
          : "Platform is disabled in gateway configuration.",
      }));
    return [...startedHealth, ...inactiveHealth];
  }
}
