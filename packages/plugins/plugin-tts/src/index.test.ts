import { describe, expect, it } from "bun:test";
import { TTSGenerationPlugin } from "./index";

describe("TTSGenerationPlugin", () => {
  it("exposes a workspace-native tts plugin descriptor", () => {
    expect(TTSGenerationPlugin.name).toBe("@elizaos/plugin-tts");
    expect(TTSGenerationPlugin.services).toEqual([]);
  });
});
