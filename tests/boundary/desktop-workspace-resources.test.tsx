// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ComputerOrigin } from "../../apps/desktop/src/renderer/computer-origin";
import { desktopQueryClient } from "../../apps/desktop/src/renderer/lib";
import {
  refreshWorkspaceResources,
  useWorkspaceResource,
  workspaceMutationRequest,
  workspaceResourceOrigin,
} from "../../apps/desktop/src/renderer/workspace-resources";

const origin: ComputerOrigin = {
  botId: "first-bot",
  originConversationId: "first-chat",
  workspacePath: "/projects/first",
};

it("requires the captured workspace for a repository mutation", () => {
  const request = { type: "stage-all", workspacePath: "/stale" };
  expect(
    workspaceResourceOrigin(origin, "/projects/other", "linux"),
  ).toBeUndefined();
  expect(() => workspaceMutationRequest(request)).toThrow(
    "confirmed conversation workspace",
  );
  expect(
    workspaceMutationRequest(
      request,
      workspaceResourceOrigin(origin, "/projects/first/", "linux"),
    ),
  ).toEqual({ type: "stage-all", ...origin });
});

function Branches({ owner }: { owner: ComputerOrigin }) {
  const resource = useWorkspaceResource<{ branches: unknown[] }>(
    "/repo/branches",
    owner,
  );
  return <div>{resource.data?.branches.length}</div>;
}

it("shares repository reads but refreshes stale views only for the updated conversation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requestAgent = vi.fn().mockResolvedValue({
    body: '{"branches":[]}',
    status: 200,
    statusText: "",
    headers: { "content-type": "application/json" },
  });
  vi.stubGlobal("doolittle", {
    requestAgent,
    cancelAgentRequest: vi.fn().mockResolvedValue(undefined),
  });
  const other = { ...origin, originConversationId: "second-chat" };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <>
          <Branches owner={origin} />
          <Branches owner={origin} />
          <Branches owner={other} />
        </>,
      ),
    );
    await vi.waitFor(() => expect(container.textContent).toBe("000"));
    expect(requestAgent).toHaveBeenCalledTimes(2);

    await act(async () => root.render(<Branches owner={other} />));
    await act(async () => refreshWorkspaceResources(origin));
    expect(requestAgent).toHaveBeenCalledTimes(2);

    await act(async () =>
      root.render(
        <>
          <Branches owner={other} />
          <Branches owner={origin} />
        </>,
      ),
    );
    await vi.waitFor(() => expect(requestAgent).toHaveBeenCalledTimes(3));
    expect(requestAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "/repo/branches", ...origin }),
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    vi.unstubAllGlobals();
  }
});
