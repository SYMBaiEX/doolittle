import { describe, expect, it } from "vitest";
import { settingsResourcePolicy } from "./SettingsPage";

describe("settings resource policy", () => {
  it("keeps the settings document active while deferring detail reads for providers", () => {
    expect(settingsResourcePolicy("providers", true)).toEqual({
      settings: true,
      themes: false,
      execution: false,
      runtime: false,
    });
    expect(settingsResourcePolicy("providers", false)).toEqual({
      settings: false,
      themes: false,
      execution: false,
      runtime: false,
    });
  });

  it("activates detail resources only when their category becomes visible", () => {
    expect(settingsResourcePolicy("appearance", true)).toMatchObject({
      settings: true,
      themes: true,
      execution: false,
      runtime: false,
    });
    expect(settingsResourcePolicy("execution", true)).toMatchObject({
      settings: true,
      themes: false,
      execution: true,
      runtime: false,
    });
    expect(settingsResourcePolicy("model", true)).toMatchObject({
      settings: true,
      themes: false,
      execution: false,
      runtime: true,
    });
    expect(settingsResourcePolicy("advanced", true)).toEqual({
      settings: true,
      themes: true,
      execution: true,
      runtime: false,
    });
  });
});
