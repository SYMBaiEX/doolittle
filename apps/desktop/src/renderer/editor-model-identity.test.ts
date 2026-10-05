import { describe, expect, it } from "vitest";
import { editorModelQuery } from "./editor-model-identity";

describe("owned Monaco model identity", () => {
  it.each(["ts", "tsx", "js", "jsx"])(
    "preserves %s detection in the installed TS worker's suffix contract",
    (extension) => {
      const uri = `file:///workspace/component.${extension}?${editorModelQuery(`component.${extension}`, "preview", "bot", "chat")}`;
      expect(uri.slice(uri.lastIndexOf(".") + 1)).toBe(extension);
      expect(new URL(uri).pathname).toBe(`/workspace/component.${extension}`);
    },
  );
  it("separates owners and live views without altering the canonical file path", () => {
    const one = editorModelQuery("app.tsx", "preview", "one", "chat");
    expect(editorModelQuery("app.tsx", "full", "one", "chat")).not.toBe(one);
    expect(editorModelQuery("app.tsx", "preview", "two", "chat")).not.toBe(one);
    expect(
      editorModelQuery("app.tsx", "preview", "one", "other-chat"),
    ).not.toBe(one);
    expect(new URLSearchParams(one).get("doolittle")).toBe(
      JSON.stringify(["one", "chat", "preview"]),
    );
  });
});
