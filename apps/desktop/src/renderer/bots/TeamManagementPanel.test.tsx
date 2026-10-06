// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopRequest } from "../lib";
import { TeamManagementPanel } from "./TeamManagementPanel";

const state = vi.hoisted(() => ({
  error: "",
  loading: false,
  revision: 7,
  teams: [
    {
      id: "team",
      name: "Research",
      memberBotIds: ["source"],
      createdAt: "now",
      updatedAt: "now",
    },
  ],
  reload: vi.fn(),
}));
vi.mock("../lib", () => ({
  desktopRequest: vi.fn(async () => ({})),
  errorMessage: (cause: unknown) => String(cause),
  useApiResource: (path: string) => ({
    data:
      path === "/bots"
        ? {
            bots: [
              { id: "source", name: "Source" },
              { id: "other", name: "Other" },
              { id: "archived", name: "Archived", archivedAt: "now" },
            ],
          }
        : { version: 1, revision: state.revision, teams: state.teams },
    error: state.error,
    loading: state.loading,
    reload: state.reload,
  }),
}));
describe("TeamManagementPanel", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    state.error = "";
    state.loading = false;
    state.revision = 7;
    state.teams = [
      {
        id: "team",
        name: "Research",
        memberBotIds: ["source"],
        createdAt: "now",
        updatedAt: "now",
      },
    ];
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const render = () =>
    act(async () => root.render(<TeamManagementPanel active />));
  it("edits only explicit live members and sends captured revision plus native consent", async () => {
    await render();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent?.startsWith("Edit members"))
        ?.click(),
    );
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).not.toContain("Archived");
    const checks = dialog?.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checks?.[0].checked).toBe(true);
    expect(checks?.[1].checked).toBe(false);
    await act(async () => checks?.[1].click());
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Save team")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith("/bots/teams/team", "PATCH", {
      name: "Research",
      memberBotIds: ["source", "other"],
      expectedRevision: 7,
      consent: true,
    });
    expect(state.reload).toHaveBeenCalled();
  });
  it("archives without deleting histories and leaves errors actionable", async () => {
    await render();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent?.startsWith("Archive team"))
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      "/bots/teams/team/archive",
      "POST",
      { expectedRevision: 7, consent: true },
    );
    expect(host.textContent).toContain(
      "Private histories and promoted findings were retained",
    );
    vi.mocked(desktopRequest).mockRejectedValueOnce(
      new Error("Revision changed"),
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent?.startsWith("Archive team"))
        ?.click(),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Revision changed",
    );
  });
  it("does not preselect all bots for a new team", async () => {
    await render();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Create team")
        ?.click(),
    );
    expect(
      [
        ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].every((input) => !input.checked),
    ).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "Save team",
      )?.disabled,
    ).toBe(true);
  });

  it("opens the existing member editor from a team menu and keeps native consent on save", async () => {
    await render();
    await act(async () =>
      host.querySelector("li h3")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    const item = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((entry) => entry.textContent === "Edit team and members…");
    await act(async () => item?.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      "Edit Research",
    );
    expect(desktopRequest).not.toHaveBeenCalled();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((entry) => entry.textContent === "Save team")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith("/bots/teams/team", "PATCH", {
      name: "Research",
      memberBotIds: ["source"],
      expectedRevision: 7,
      consent: true,
    });
  });

  it("archives only the menu’s target team and revokes menus after catalog revision changes", async () => {
    state.teams.push({
      id: "second-team",
      name: "Build",
      memberBotIds: ["other"],
      createdAt: "now",
      updatedAt: "now",
    });
    await render();
    await act(async () =>
      host.querySelectorAll("li h3")[1]?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    expect(
      document.body.querySelector('[role="menu"]')?.getAttribute("aria-label"),
    ).toBe("Team: Build");
    await act(async () =>
      [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((entry) => entry.textContent === "Archive team…")
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith(
      "/bots/teams/second-team/archive",
      "POST",
      { expectedRevision: 7, consent: true },
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    await act(async () =>
      host.querySelector("li h3")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    state.revision = 8;
    await render();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
