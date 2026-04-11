import { describe, expect, it } from "bun:test";
import {
  parseDelegationFilter,
  parseDelegationLabels,
  parseDelegationMetadata,
  parseDelegationSegments,
  parseDelegationSpawnSegments,
  parseRetryPayload,
} from "./delegation-command-parsers";

describe("delegation command parsers", () => {
  it("parses create and spawn payload segments", () => {
    expect(
      parseDelegationSegments(
        "Investigate | group:research | priority:high :: inspect the issue",
      ),
    ).toEqual({
      head: "Investigate",
      objective: "inspect the issue",
      options: {
        group: "research",
        priority: "high",
      },
    });

    expect(
      parseDelegationSpawnSegments(
        "task-1 | title:Child Task | labels:focus :: follow up",
      ),
    ).toEqual({
      parentId: "task-1",
      objective: "follow up",
      options: {
        title: "Child Task",
        labels: "focus",
      },
    });
  });

  it("parses labels, metadata, and queue filters", () => {
    expect(parseDelegationLabels("focus, ui ,research")).toEqual([
      "focus",
      "ui",
      "research",
    ]);
    expect(parseDelegationMetadata("owner=alice, scope = bugfix")).toEqual({
      owner: "alice",
      scope: "bugfix",
    });
    expect(
      parseDelegationFilter(
        "limit:3 group:research priority:high status:running mode:delegated",
      ),
    ).toEqual({
      limit: 3,
      concurrency: 3,
      group: "research",
      priority: "high",
      status: "running",
      executionMode: "delegated",
    });
  });

  it("parses retry payloads with cascade hints", () => {
    expect(
      parseRetryPayload("task-1 | cascade:children :: try again carefully"),
    ).toEqual({
      id: "task-1",
      note: "try again carefully",
      cascadeChildren: true,
    });
  });
});
