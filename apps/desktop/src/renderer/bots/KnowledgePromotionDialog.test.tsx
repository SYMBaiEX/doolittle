// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisplayMessage } from "../chat/models";
import {
  KnowledgePromotionDialog,
  type KnowledgePromotionSource,
} from "./KnowledgePromotionDialog";
import { promoteKnowledgeMessage } from "./project-knowledge";

const state = vi.hoisted(() => ({
  loading: false,
  error: "",
  teams: [
    { id: "team", name: "Research", memberBotIds: ["source", "other"] },
    { id: "outside", name: "Private team", memberBotIds: ["other"] },
  ],
}));
vi.mock("../lib", () => ({
  useApiResource: () => ({
    data: { teams: state.teams },
    error: state.error,
    loading: state.loading,
  }),
  errorMessage: (cause: unknown) => String(cause),
}));
vi.mock("./project-knowledge", () => ({
  promoteKnowledgeMessage: vi.fn(async () => ({ id: "finding" })),
}));
describe("KnowledgePromotionDialog", () => {
  let root: Root;
  let host: HTMLDivElement;
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const source: KnowledgePromotionSource = {
    botId: "source",
    sessionId: "captured-session",
    message: {
      id: "message",
      runId: "run",
      content: "Exact finding",
    } as DisplayMessage,
    returnFocusTarget: null,
  };
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    state.error = "";
    state.loading = false;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it("shows only the captured bot's teams and leaves saving disabled until an explicit scope is selected", async () => {
    await act(async () =>
      root.render(
        <KnowledgePromotionDialog
          source={source}
          onClose={onClose}
          onSaved={onSaved}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll("option")].map((option) => option.value),
    ).toEqual(["", "team:team"]);
    const save = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Save finding",
    );
    expect(save?.disabled).toBe(true);
    const select = host.querySelector("select");
    await act(async () => {
      if (select) {
        select.value = "team:team";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await act(async () => save?.click());
    expect(promoteKnowledgeMessage).toHaveBeenCalledWith({
      sourceBotId: "source",
      sessionId: "captured-session",
      message: source.message,
      scope: { kind: "team", id: "team" },
    });
    expect(onSaved).toHaveBeenCalledWith("captured-session");
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("keeps a failed promotion visible and does not claim sharing or dismiss the dialog", async () => {
    vi.mocked(promoteKnowledgeMessage).mockRejectedValueOnce(
      new Error("Membership changed"),
    );
    await act(async () =>
      root.render(
        <KnowledgePromotionDialog
          source={{ ...source, projectId: "project" }}
          onClose={onClose}
          onSaved={onSaved}
        />,
      ),
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Save finding")
        ?.click(),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Membership changed",
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
  });
});
