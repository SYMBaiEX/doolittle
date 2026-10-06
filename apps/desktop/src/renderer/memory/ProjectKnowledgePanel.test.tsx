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
  teamsError: "",
  loading: false,
  teams: [] as Array<{
    id: string;
    name: string;
    memberBotIds: string[];
    archivedAt?: string;
  }>,
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
        : path === "/bots/teams"
          ? { version: 1, revision: 0, teams: state.teams }
          : state.records,
    error:
      path === "/bots/knowledge"
        ? state.error
        : path === "/bots/teams"
          ? state.teamsError
          : "",
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
    state.teamsError = "";
    state.loading = false;
    state.teams = [];
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
  it("uses explicit current team membership, never project membership as a team alias", async () => {
    state.teams = [
      { id: "team", name: "Research", memberBotIds: ["source", "outsider"] },
    ];
    state.records = {
      knowledge: [{ ...record, scope: { kind: "team", id: "team" } }],
      grants: [],
    };
    await render();
    expect(
      [...container.querySelectorAll("option")].map((option) => option.value),
    ).toEqual(["outsider"]);
    expect(container.textContent).toContain("team Research");
    state.teams[0].memberBotIds = ["outsider"];
    await render();
    expect(container.querySelector("select")?.disabled).toBe(true);
    expect(container.textContent).toContain("No eligible bots in this team");
  });
  it("surfaces legacy ambiguous identities and disables all new grants without deleting provenance", async () => {
    state.records = {
      knowledge: [
        {
          ...record,
          integrity: {
            status: "ambiguous-document",
            message: "Exact source must be re-promoted.",
          },
        },
      ],
      grants: [],
    };
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Exact source must be re-promoted",
    );
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Grant access",
      )?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain("From Source");
    expect(container.textContent).toContain("Revoke finding");
  });

  it("grants only the finding menu’s selected eligible bot through the native-consent path", async () => {
    state.records = { knowledge: [record], grants: [] };
    await render();
    await act(async () =>
      container.querySelector("li h3")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain("Grant access to Allowed…");
    expect(menu?.textContent).not.toContain("Outsider");
    await act(async () =>
      [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
        .find((item) => item.textContent === "Grant access to Allowed…")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      `/bots/knowledge/${record.id}/grant`,
      "POST",
      { consent: true, targetBotId: "allowed" },
    );
  });

  it("revokes the exact grant without substituting a selected finding or bot", async () => {
    const second = {
      ...record,
      id: "00000000-0000-4000-8000-000000000002",
      title: "Second finding",
    };
    state.records = {
      knowledge: [record, second],
      grants: [
        { knowledgeId: record.id, botId: "allowed", grantedAt: "now" },
        { knowledgeId: second.id, botId: "allowed", grantedAt: "now" },
      ],
    };
    await render();
    const row = container.querySelectorAll(
      'section[aria-label="Shared knowledge"] > ul > li',
    )[1];
    await act(async () =>
      row?.querySelector("ul li span")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    expect(
      document.body.querySelector('[role="menu"]')?.getAttribute("aria-label"),
    ).toBe("Knowledge access: Allowed");
    await act(async () =>
      document.body.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      `/bots/knowledge/${second.id}/revoke`,
      "POST",
      { consent: true, targetBotId: "allowed" },
    );
  });

  it("blocks team grants when current membership cannot be verified and closes stale eligibility menus", async () => {
    state.teams = [
      { id: "team", name: "Research", memberBotIds: ["source", "outsider"] },
    ];
    state.records = {
      knowledge: [{ ...record, scope: { kind: "team", id: "team" } }],
      grants: [],
    };
    state.teamsError = "Membership unavailable";
    await render();
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Grant access",
      )?.disabled,
    ).toBe(true);
    await act(async () =>
      container.querySelector("li h3")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    const grant = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Grant access to Outsider…");
    expect(grant?.hasAttribute("data-disabled")).toBe(true);
    await act(async () => grant?.click());
    expect(desktopRequest).not.toHaveBeenCalled();
    state.teamsError = "";
    state.teams[0].memberBotIds = ["outsider"];
    await render();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
