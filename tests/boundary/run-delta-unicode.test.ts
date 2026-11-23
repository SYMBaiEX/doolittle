/// <reference lib="es2024.string" />

import { expect, it } from "vitest";
import { RunControllerStore } from "../../packages/agent/src/services/run-controller/store";

const maxBytes = 32 * 1_024;
const deltaBytes = maxBytes - Buffer.byteLength(JSON.stringify({ delta: "" }));

it.each([
  { name: "empty", delta: "", expected: "" },
  {
    name: "ASCII at budget",
    delta: "a".repeat(deltaBytes),
    expected: "a".repeat(deltaBytes),
  },
  {
    name: "ASCII over budget",
    delta: "a".repeat(maxBytes + 1),
    expected: "a".repeat(deltaBytes),
  },
  {
    name: "BMP at budget",
    delta: "é".repeat(deltaBytes / 2),
    expected: "é".repeat(deltaBytes / 2),
  },
  {
    name: "BMP over budget",
    delta: "界".repeat(maxBytes),
    expected: "界".repeat(Math.floor(deltaBytes / 3)),
  },
  {
    name: "astral at budget",
    delta: "😀".repeat(deltaBytes / 4),
    expected: "😀".repeat(deltaBytes / 4),
  },
  {
    name: "astral over budget",
    delta: "😀".repeat(maxBytes),
    expected: "😀".repeat(deltaBytes / 4),
  },
  ...[1, 2, 3].map((remaining) => ({
    name: `astral with ${remaining} bytes remaining`,
    delta: `${"a".repeat(deltaBytes - remaining)}${"😀".repeat(10)}`,
    expected: "a".repeat(deltaBytes - remaining),
  })),
])(
  "keeps $name delta well-formed within its JSON byte budget",
  ({ delta, expected }) => {
    const store = new RunControllerStore();
    const { event } = store.appendEvent("run", "response.output_text.delta", {
      delta,
    });
    const data = event.data as { delta: string };

    expect(data.delta.isWellFormed()).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThanOrEqual(
      maxBytes,
    );
    expect(data.delta).toBe(expected);
    expect(store.listEvents("run")[0].data).toEqual(data);
  },
);

it.each([
  { name: "newline", character: "\n" },
  { name: "quote", character: '"' },
  { name: "backslash", character: "\\" },
  { name: "control", character: "\u0001" },
])("budgets JSON escapes for $name deltas", ({ character }) => {
  const store = new RunControllerStore();
  const delta = `${character}😀`.repeat(maxBytes);
  const metadata = { id: 'message"', part_id: "part\\", sequence: 42 };
  const { event } = store.appendEvent("run", "response.output_text.delta", {
    ...metadata,
    delta,
  });
  const data = event.data as typeof metadata & { delta: string };

  expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThanOrEqual(maxBytes);
  expect(data.delta.isWellFormed()).toBe(true);
  expect(delta.startsWith(data.delta)).toBe(true);
  expect(data.delta.length).toBeGreaterThan(0);
  expect(data).toMatchObject(metadata);
  expect(store.listEvents("run")[0].data).toEqual(data);
});

it("keeps deltas within budget when metadata alone exceeds the budget", () => {
  const store = new RunControllerStore();
  const { event } = store.appendEvent("run", "response.output_text.delta", {
    id: "\n".repeat(maxBytes),
    part_id: '"'.repeat(maxBytes),
    sequence: 42,
    delta: "output",
  });
  expect(Buffer.byteLength(JSON.stringify(event.data))).toBeLessThanOrEqual(
    maxBytes,
  );
  expect(event.data).toEqual({ sequence: 42, delta: "output" });
});

it("keeps the raw delta truncation boundary well-formed for terminal events", () => {
  const store = new RunControllerStore();
  const prefix = "a".repeat(maxBytes - 3);
  const { event } = store.appendEvent(
    "run",
    "response.output_text.delta",
    { delta: `${prefix}😀` },
    true,
  );
  const data = event.data as { delta: string };

  expect(data.delta.isWellFormed()).toBe(true);
  expect(Buffer.byteLength(data.delta)).toBeLessThanOrEqual(maxBytes);
  expect(data.delta).toBe(prefix);
});
