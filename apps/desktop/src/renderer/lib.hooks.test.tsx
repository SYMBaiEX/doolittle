// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDebouncedValue } from "./lib";

function DebouncedValueProbe({ value }: { value: string }) {
  const debouncedValue = useDebouncedValue(value, 200);
  return <output>{debouncedValue}</output>;
}

describe("useDebouncedValue", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  test("publishes only the latest value after the quiet period", () => {
    act(() => root.render(<DebouncedValueProbe value="initial" />));
    expect(container.textContent).toBe("initial");

    act(() => root.render(<DebouncedValueProbe value="first" />));
    act(() => vi.advanceTimersByTime(120));
    act(() => root.render(<DebouncedValueProbe value="final" />));
    act(() => vi.advanceTimersByTime(199));
    expect(container.textContent).toBe("initial");

    act(() => vi.advanceTimersByTime(1));
    expect(container.textContent).toBe("final");
  });
});
