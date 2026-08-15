import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("runtime overview layout", () => {
  it("keeps one summary source and two action-oriented cards", () => {
    const overview = read("./runtime/RuntimeOverview.tsx");

    expect(overview).toContain(
      '<CompactStatStrip\n        label="Runtime summary"',
    );
    expect(overview).toContain("<h2>Account routing</h2>");
    expect(overview).toContain("<NativeAutonomyPanel");
    expect(overview).toContain('label="Startup receipt"');
    expect(overview).not.toContain("Conversation model");
    expect(overview).not.toContain("Connected runtime route");
  });

  it("bounds autonomy controls across desktop and compact widths", () => {
    const layout = read("./runtime/runtime-layout.ts");
    const autonomy = read("./components/NativeAutonomyPanel.tsx");

    expect(layout).toContain(
      '"grid grid-cols-2 items-start gap-2.5 max-[760px]:grid-cols-1"',
    );
    expect(layout).toContain(
      "min-[761px]:max-[1080px]:[&>:last-child]:col-span-full",
    );
    expect(autonomy).toContain(
      "min-[921px]:grid-cols-[minmax(148px,0.65fr)_minmax(190px,auto)]",
    );
    expect(autonomy).toContain("grid grid-cols-1 items-end gap-2");
  });
});
