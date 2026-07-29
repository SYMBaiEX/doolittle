import { describe, expect, it } from "vitest";
import { compilerOptionsForMonaco } from "./editor-project-compiler-options";

describe("compilerOptionsForMonaco", () => {
  it("maps modern project settings onto Monaco's older TS worker contract", () => {
    const options = compilerOptionsForMonaco({
      allowJs: false,
      baseUrl: "/workspace/apps/desktop",
      jsx: "react-jsx",
      module: "esnext",
      moduleResolution: "bundler",
      paths: {
        "@/*": ["../../packages/agent/src/*"],
      },
      target: "es2022",
      types: ["node", "vite/client"],
    });

    expect(options.allowJs).toBe(false);
    expect(options.baseUrl).toBe("/workspace/apps/desktop");
    expect(options.jsx).toBe(4);
    expect(options.module).toBe(99);
    expect(options.moduleResolution).toBe(2);
    expect(options.target).toBe(99);
    expect(options.types).toEqual(["node", "vite/client"]);
  });
});
