import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/ui/hooks/useDocumentVisibility", () => ({
  useIntervalWhenDocumentVisible: () => undefined,
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return {
    ...actual,
    useApiResource: () => ({
      data: {
        approvals: [
          {
            command: "git push",
            expiresAt: "2026-08-15T12:00:00.000Z",
            id: "approval-1",
            reason: "Publish the verified release.",
          },
        ],
      },
      error: "",
      loading: false,
      reload: vi.fn(),
    }),
  };
});

import { InlineApprovalPanel } from "./InlineApprovalPanel";

describe("InlineApprovalPanel", () => {
  it("renders pending approvals with responsive Tailwind-only actions", () => {
    const markup = renderToStaticMarkup(<InlineApprovalPanel active />);

    expect(markup).toContain('aria-label="Pending agent approvals"');
    expect(markup).toContain("Agent needs your approval");
    expect(markup).toContain("git push");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
    expect(markup).toContain("min-[701px]:grid-cols-[minmax(0,1fr)_auto]");
    expect(markup).not.toContain("inline-approval-panel");
  });
});
