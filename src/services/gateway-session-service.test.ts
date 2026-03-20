import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GatewaySessionService } from "./gateway-session-service";

describe("GatewaySessionService", () => {
  it("tracks voice mode and home channel state on sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-gateway-sessions-"));
    const service = new GatewaySessionService(root);

    try {
      const session = service.resolve({
        platform: "telegram",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      });

      const voiceOnly = service.setVoiceMode(session.sessionKey, "voice_only");
      expect(voiceOnly.voiceMode).toBe("voice_only");
      expect(voiceOnly.voiceUpdatedAt).toBeDefined();
      expect(voiceOnly.voiceUpdatedReason).toBe("voice-mode:voice_only");

      const joined = service.setVoiceChannel(
        session.sessionKey,
        "voice-room-1",
      );
      expect(joined.voiceChannelId).toBe("voice-room-1");
      expect(joined.voiceChannelState).toBe("connected");
      expect(joined.voiceUpdatedReason).toBe("voice-channel:join:voice-room-1");

      const home = service.markHome(session.sessionKey, {
        isHome: true,
        label: "Primary Telegram",
      });
      expect(home.isHome).toBe(true);
      expect(home.homeLabel).toBe("Primary Telegram");
      expect(home.homeUpdatedAt).toBeDefined();

      const homes = service.homeForPlatform("telegram");
      expect(homes).toHaveLength(1);
      expect(homes[0]?.sessionKey).toBe(session.sessionKey);

      const left = service.setVoiceChannel(session.sessionKey);
      expect(left.voiceChannelState).toBe("disconnected");
      expect(left.voiceUpdatedReason).toBe("voice-channel:leave");
      expect(service.inspect(session.sessionKey).sessionKey).toBe(
        session.sessionKey,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
