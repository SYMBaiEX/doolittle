import { describe, expect, it } from "bun:test";
import type { CliState } from "@/cli/execution";
import { createTuiActivityFeed } from "@/cli/tui-activity-feed";

describe("createTuiActivityFeed", () => {
  it("dedupes notices and keeps the latest six", () => {
    const state: CliState = {
      activeSessionId: "cli:test",
      notices: [],
    };
    const activity: string[] = [];
    const feed = createTuiActivityFeed({
      activityPane: {
        log(content: string) {
          activity.push(content);
        },
      },
      state,
      shouldDeferForeignActivity: () => false,
      scheduleRefreshPanels() {},
    });

    for (const suffix of ["one", "two", "three", "four", "five", "six"]) {
      feed.pushNotice("status", `notice-${suffix}`);
    }
    feed.pushNotice("status", "notice-three");

    expect(activity).toHaveLength(0);
    expect(state.notices).toHaveLength(6);
    expect(state.notices[0]?.message).toBe("notice-three");
    expect(
      state.notices.filter((entry) => entry.message === "notice-three"),
    ).toHaveLength(1);
  });

  it("queues foreign activity while deferred and flushes once allowed", () => {
    const state: CliState = {
      activeSessionId: "cli:test",
      notices: [],
    };
    const activity: string[] = [];
    let defer = true;
    let refreshCount = 0;
    const feed = createTuiActivityFeed({
      activityPane: {
        log(content: string) {
          activity.push(content);
        },
      },
      state,
      shouldDeferForeignActivity: () => defer,
      scheduleRefreshPanels() {
        refreshCount += 1;
      },
    });

    feed.routeForeignActivity("stdout", "hello there");
    expect(activity).toHaveLength(0);

    defer = false;
    feed.flushDeferredForeignActivity();

    expect(activity).toHaveLength(1);
    expect(activity[0]).toContain("srv+");
    expect(activity[0]).toContain("hello there");
    expect(refreshCount).toBe(0);
  });
});
