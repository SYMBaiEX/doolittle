import { describe, expect, it } from "vitest";
import { filterReviewItems, reviewItems, statusTone } from "./models";

describe("review models", () => {
  it("normalizes queue records and keeps pending approvals first", () => {
    const items = reviewItems(
      {
        approvals: [
          {
            id: "approval-1",
            command: "  git   status  ",
            reason: "Inspect the repository",
            status: "pending",
          },
        ],
      },
      {
        changes: [
          {
            path: "src/ReviewPage.tsx",
            staged: false,
            unstaged: true,
          },
        ],
      },
      undefined,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "approvals:approval-1",
      kind: "approvals",
      title: "git status",
      status: "pending",
    });
    expect(items[1]).toMatchObject({
      id: "changes:src/ReviewPage.tsx",
      title: "ReviewPage.tsx",
      path: "src/ReviewPage.tsx",
      status: "working",
    });
  });

  it("filters by kind and query without changing the source collection", () => {
    const items = reviewItems(
      {
        approvals: [
          { id: "one", command: "npm test", status: "pending" },
          { id: "two", command: "git diff", status: "denied" },
        ],
      },
      null,
      undefined,
    );

    expect(filterReviewItems(items, "approvals", "npm")).toHaveLength(1);
    expect(filterReviewItems(items, "all", "denied")[0]?.id).toBe(
      "approvals:two",
    );
    expect(items).toHaveLength(2);
  });

  it("keeps local status tones explicit", () => {
    expect(statusTone("passed")).toBe("good");
    expect(statusTone("changes requested")).toBe("bad");
    expect(statusTone("in_progress")).toBe("warn");
    expect(statusTone("unknown-state")).toBe("neutral");
  });
});
