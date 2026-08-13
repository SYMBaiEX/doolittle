// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useApiResourceMock, useConnectionsActionsMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
  useConnectionsActionsMock: vi.fn(),
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return { ...actual, useApiResource: useApiResourceMock };
});
vi.mock("./useConnectionsActions", async () => {
  const actual = await vi.importActual<
    typeof import("./useConnectionsActions")
  >("./useConnectionsActions");
  return { ...actual, useConnectionsActions: useConnectionsActionsMock };
});

import { ConnectionsPage } from "../ConnectionsPage";
import { ModelsPage } from "../ModelsPage";

const resource = (overrides: Record<string, unknown> = {}) => ({
  data: null,
  error: "",
  loading: false,
  reload: vi.fn(),
  status: "ready",
  hasData: false,
  ...overrides,
});

describe("configuration resource contracts", () => {
  it("keeps accounts visible when the optional account pool fails", () => {
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === null
        ? resource({ error: "pool unavailable", status: "error" })
        : resource({
            data: {
              activeProvider: "codex",
              accounts: { codex: { nativeReady: true, detail: "Signed in" } },
            },
            hasData: true,
          }),
    );
    useConnectionsActionsMock.mockReturnValue({
      accountImports: {},
      authStates: {},
      busy: "",
      cancelAccountSignIn: vi.fn(),
      deleteAccount: vi.fn(),
      feedback: null,
      movePoolAccount: vi.fn(),
      mutate: vi.fn(),
      refreshPoolAccountUsage: vi.fn(),
      selectAccount: vi.fn(),
      selectedAccounts: {},
      setAccountImports: vi.fn(),
      setPoolStrategy: vi.fn(),
      startAccountSignIn: vi.fn(),
      submitAccountSignInCode: vi.fn(),
      testPoolAccount: vi.fn(),
      updateAccount: vi.fn(),
    });

    const markup = renderToStaticMarkup(<ConnectionsPage active />);
    expect(markup).toContain("Provider connections");
    expect(markup).toContain("Codex");
    expect(markup).toContain("Retry pools");
  });

  it("keeps model settings visible when the catalog fails", () => {
    useApiResourceMock.mockImplementation((path: string | null) => {
      if (path === "/settings") {
        return resource({
          data: { settings: { model: { provider: "ollama", model: "local" } } },
          hasData: true,
        });
      }
      if (path?.startsWith("/runtime/models")) {
        return resource({ error: "catalog unavailable", status: "error" });
      }
      return resource({ status: "disabled" });
    });

    const markup = renderToStaticMarkup(
      <ModelsPage active refreshRuntime={() => undefined} runtime={null} />,
    );
    expect(markup).toContain("Active model");
    expect(markup).toContain("local");
    expect(markup).toContain("Partially available");
  });
});
