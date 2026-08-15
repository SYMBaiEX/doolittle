import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const messageActions = readFileSync(
  new URL("./MessageActions.tsx", import.meta.url),
  "utf8",
);

describe("chat message action layout", () => {
  it("keeps actions in a dedicated footer instead of overlaying message metadata", () => {
    expect(messageActions).toContain("static flex min-w-0 max-w-full");
    expect(messageActions).toContain("flex-wrap");
    expect(messageActions).toContain("justify-end");
    expect(messageActions).toContain("pointer-fine:pointer-events-none");
    expect(messageActions).toContain("pointer-fine:opacity-0");
    expect(messageActions).toContain("pointer-fine:group-hover:opacity-100");
    expect(messageActions).toContain("pointer-fine:focus-within:opacity-100");
    expect(messageActions).toContain("pointer-coarse:opacity-100");
    expect(messageActions).toContain(
      "pointer-fine:transition-[opacity,transform]",
    );
  });

  it("exposes the controls as one labelled toolbar", () => {
    expect(messageActions).toContain('aria-label="Message actions"');
    expect(messageActions).toContain('role="toolbar"');
  });
});
