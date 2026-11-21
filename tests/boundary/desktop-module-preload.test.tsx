// @vitest-environment jsdom
import { act, Component, type ReactNode, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPreloadedComponent } from "../../apps/desktop/src/renderer/app-shell/preloaded-component";

const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
  previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function Conversation({ name }: { name: string }) {
  const [draft, setDraft] = useState(0);
  return (
    <button type="button" onClick={() => setDraft(draft + 1)}>
      {name} draft {draft}
    </button>
  );
}

it("renders an already loaded conversation synchronously and preserves drafts", async () => {
  const load = vi.fn(async () => ({ default: Conversation }));
  const route = createPreloadedComponent(load);
  await route.preload();
  act(() => {
    root.render(
      <Suspense fallback="Loading conversation">
        <route.Component name="Chat" />
      </Suspense>,
    );
  });
  expect(container.textContent).toBe("Chat draft 0");
  act(() => container.querySelector("button")?.click());
  act(() => {
    root.render(
      <Suspense fallback="Loading conversation">
        <route.Component name="Renamed chat" />
      </Suspense>,
    );
  });
  expect(container.textContent).toBe("Renamed chat draft 1");
  expect(load).toHaveBeenCalledOnce();
});

it("allows navigation during an import and shares the in-flight module", async () => {
  let finish!: (value: { default: typeof Conversation }) => void;
  const pending = new Promise<{ default: typeof Conversation }>((resolve) => {
    finish = resolve;
  });
  const load = vi.fn(() => pending);
  const route = createPreloadedComponent(load);
  const preload = route.preload();
  act(() => {
    root.render(
      <Suspense fallback="Loading conversation">
        <route.Component name="Chat" />
      </Suspense>,
    );
  });
  expect(container.textContent).toBe("Loading conversation");
  act(() => root.render(<p>Settings</p>));
  await act(async () => {
    finish({ default: Conversation });
    await preload;
  });
  expect(container.textContent).toBe("Settings");
  act(() => root.render(<route.Component name="Chat" />));
  expect(container.textContent).toBe("Chat draft 0");
  expect(load).toHaveBeenCalledOnce();
});

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>Route unavailable</p> : this.props.children;
  }
}

it("passes a rejected preload to the route error boundary", async () => {
  const route = createPreloadedComponent<{ name: string }>(async () => {
    throw new Error("Chunk failed");
  });
  await expect(route.preload()).rejects.toThrow("Chunk failed");
  await act(async () =>
    root.render(
      <RouteErrorBoundary>
        <Suspense fallback="Loading conversation">
          <route.Component name="Chat" />
        </Suspense>
      </RouteErrorBoundary>,
    ),
  );
  expect(container.textContent).toBe("Route unavailable");
});
