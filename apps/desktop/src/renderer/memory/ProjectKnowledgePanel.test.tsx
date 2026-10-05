// @vitest-environment jsdom
import type { SharedKnowledgeResponse } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopRequest } from "../lib";
import { ProjectKnowledgePanel } from "./ProjectKnowledgePanel";

const state = vi.hoisted(() => ({
  records: null as SharedKnowledgeResponse | null,
  error: "",
  loading: false,
  reload: vi.fn(),
}));
vi.mock("../lib", () => ({
  desktopRequest: vi.fn(async () => ({})),
  errorMessage: (cause: unknown) => String(cause),
  useApiResource: (path: string | null) => ({
    data:
      path === "/bots"
        ? {
            bots: [
              { id: "source", name: "Source", projectId: "project" },
              { id: "allowed", name: "Allowed", projectId: "project" },
              { id: "outsider", name: "Outsider", projectId: "different" },
              {
                id: "archived",
                name: "Archived",
                projectId: "project",
                archivedAt: "2026-10-04",
              },
            ],
          }
        : state.records,
    error: path === "/bots/knowledge" ? state.error : "",
    loading: state.loading,
    reload: state.reload,
  }),
}));
const record = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Selected finding",
  scope: { kind: "project", id: "project" },
  source: { botId: "source" },
} as SharedKnowledgeResponse["knowledge"][number];
describe("ProjectKnowledgePanel", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    state.records = { knowledge: [], grants: [] };
    state.error = "";
    state.loading = false;
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = () =>
    act(async () => root.render(<ProjectKnowledgePanel active />));
  it("distinguishes empty, loading, and failure without claiming automatic sharing", async () => {
    await render();
    expect(container.textContent).toContain("Nothing shared yet");
    expect(container.textContent).toContain("does not automatically share");
    state.loading = true;
    state.records = null;
    await render();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    state.loading = false;
    state.error = "Broker offline";
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Broker offline",
    );
  });
  it("offers only current project members and submits explicit native-consent requests", async () => {
    state.records = { knowledge: [record], grants: [] };
    await render();
    const options = [...container.querySelectorAll("option")].map(
      (option) => option.value,
    );
    expect(options).toEqual(["allowed"]);
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Grant access")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      `/bots/knowledge/${record.id}/grant`,
      "POST",
      { targetBotId: "allowed", consent: true },
    );
    expect(container.textContent).toContain(
      "Access granted for future consultations",
    );
  });
  it("shows provenance, revokes the exact grant, and keeps globally revoked records readable", async () => {
    state.records = {
      knowledge: [record],
      grants: [
        { knowledgeId: record.id, botId: "allowed", grantedAt: "2026-10-04" },
      ],
    };
    await render();
    expect(container.textContent).toContain("From Source");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Revoke access")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      `/bots/knowledge/${record.id}/revoke`,
      "POST",
      { targetBotId: "allowed", consent: true },
    );
    expect(container.textContent).toContain(
      "already delivered cannot be erased",
    );
    state.records = {
      knowledge: [{ ...record, revokedAt: "2026-10-04" }],
      grants: [],
    };
    await render();
    expect(container.textContent).toContain("Revoked");
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).not.toContain("Grant access");
  });
});
