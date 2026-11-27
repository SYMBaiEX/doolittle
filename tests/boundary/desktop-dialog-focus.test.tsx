// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useModalFocusBoundary } from "../../apps/desktop/src/renderer/components/useModalFocusBoundary";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { element: HTMLDivElement; root: Root }[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.element.remove();
  }
  document.body.innerHTML = "";
});

function mount() {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const entry = { element, root };
  mounted.push(entry);
  return entry;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

function pressEscape(target: Element) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
}

function BoundaryModal({
  active,
  label,
  onClose,
}: {
  active: boolean;
  label: string;
  onClose: () => void;
}) {
  const dialogRef = useModalFocusBoundary({
    active,
    onClose,
    restoreFocus: false,
  });
  if (!active) return null;
  return (
    <div aria-label={label} ref={dialogRef} role="dialog" tabIndex={-1}>
      <button type="button">{label} action</button>
    </div>
  );
}

function StackedModals({
  bottomClose,
  topClose,
}: {
  bottomClose: () => void;
  topClose: () => void;
}) {
  const [bottomOpen, setBottomOpen] = useState(true);
  const [topOpen, setTopOpen] = useState(true);
  return (
    <>
      <BoundaryModal
        active={bottomOpen}
        label="bottom"
        onClose={() => {
          bottomClose();
          setBottomOpen(false);
        }}
      />
      <BoundaryModal
        active={topOpen}
        label="top"
        onClose={() => {
          topClose();
          setTopOpen(false);
        }}
      />
    </>
  );
}

it("lets only the topmost active modal boundary consume each Escape", async () => {
  const bottomClose = vi.fn();
  const topClose = vi.fn();
  const { element, root } = mount();
  act(() =>
    root.render(
      <StackedModals bottomClose={bottomClose} topClose={topClose} />,
    ),
  );
  await flush();

  const topAction = [...element.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("top"),
  );
  expect(topAction).toBeTruthy();
  act(() => pressEscape(topAction as Element));

  expect(topClose).toHaveBeenCalledOnce();
  expect(bottomClose).not.toHaveBeenCalled();
  expect(element.querySelector('[aria-label="top"]')).toBeNull();
  expect(element.querySelector('[aria-label="bottom"]')).not.toBeNull();

  const bottomAction = element.querySelector("button");
  expect(bottomAction).toBeTruthy();
  act(() => pressEscape(bottomAction as Element));

  expect(bottomClose).toHaveBeenCalledOnce();
  expect(element.querySelector('[aria-label="bottom"]')).toBeNull();
});

function SuspendedProjectParent({
  childClose,
  parentClose,
}: {
  childClose: () => void;
  parentClose: () => void;
}) {
  const [childOpen, setChildOpen] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  useModalFocusBoundary({
    active: true,
    dialogRef,
    initialFocusRef,
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose: parentClose,
    restoreFocus: true,
    suspended: childOpen,
  });
  return (
    <div ref={backdropRef} role="presentation">
      <div aria-label="parent" ref={dialogRef} role="dialog" tabIndex={-1}>
        <button ref={initialFocusRef} type="button">
          Parent action
        </button>
        <BoundaryModal
          active={childOpen}
          label="child"
          onClose={() => {
            childClose();
            setChildOpen(false);
          }}
        />
      </div>
    </div>
  );
}

it("passes project dialog suspension through the shared keyboard ownership stack", async () => {
  const childClose = vi.fn();
  const parentClose = vi.fn();
  const { element, root } = mount();
  act(() =>
    root.render(
      <SuspendedProjectParent
        childClose={childClose}
        parentClose={parentClose}
      />,
    ),
  );
  await flush();

  const childAction = [...element.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("child"),
  );
  expect(childAction).toBeTruthy();
  act(() => pressEscape(childAction as Element));

  expect(childClose).toHaveBeenCalledOnce();
  expect(parentClose).not.toHaveBeenCalled();

  const parentAction = [...element.querySelectorAll("button")].find(
    (button) => button.textContent === "Parent action",
  );
  expect(parentAction).toBeTruthy();
  act(() => pressEscape(parentAction as Element));
  expect(parentClose).toHaveBeenCalledOnce();
});

function ProjectDialog({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  useModalFocusBoundary({
    active: open,
    dialogRef,
    initialFocusRef,
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose,
    restoreFocus: true,
  });
  if (!open) return null;
  return (
    <div ref={backdropRef} role="presentation">
      <div aria-label="project" ref={dialogRef} role="dialog" tabIndex={-1}>
        <button ref={initialFocusRef} type="button">
          Initial focus
        </button>
      </div>
    </div>
  );
}

it("keeps the project dialog's initial focus and focus restoration", async () => {
  const close = vi.fn();
  const { element, root } = mount();
  act(() =>
    root.render(
      <>
        <button data-outside type="button">
          Outside
        </button>
        <ProjectDialog onClose={close} open={false} />
      </>,
    ),
  );
  const outside = element.querySelector<HTMLButtonElement>("[data-outside]");
  expect(outside).toBeTruthy();
  outside?.focus();
  expect(document.activeElement).toBe(outside);

  act(() =>
    root.render(
      <>
        <button data-outside type="button">
          Outside
        </button>
        <ProjectDialog onClose={close} open />
      </>,
    ),
  );
  await flush();

  const initial = [...element.querySelectorAll("button")].find(
    (button) => button.textContent === "Initial focus",
  );
  expect(document.activeElement).toBe(initial);
  expect(outside?.getAttribute("aria-hidden")).toBe("true");

  act(() =>
    root.render(
      <>
        <button data-outside type="button">
          Outside
        </button>
        <ProjectDialog onClose={close} open={false} />
      </>,
    ),
  );
  await flush();

  const restoredOutside =
    element.querySelector<HTMLButtonElement>("[data-outside]");
  expect(document.activeElement).toBe(restoredOutside);
  expect(restoredOutside?.hasAttribute("aria-hidden")).toBe(false);
});
