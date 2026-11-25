// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkConfirm } from "../../apps/desktop/src/renderer/work-surface/WorkSurface";

function ConfirmFixture({ onCancel }: { onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Delete item
      </button>
      {open ? (
        <WorkConfirm
          cancelLabel="Keep item"
          confirmLabel="Confirm delete"
          detail="This cannot be undone."
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
          onConfirm={() => {}}
          title="Delete this item?"
        />
      ) : null}
    </>
  );
}

it("names destructive confirmations, focuses cancel, and treats Escape as cancel", () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onCancel = vi.fn();
  try {
    act(() => root.render(<ConfirmFixture onCancel={onCancel} />));
    const opener = [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent === "Delete item",
    );
    expect(opener).toBeDefined();
    act(() => {
      opener?.focus();
      opener?.click();
    });

    const confirmation = host.querySelector('[role="alertdialog"]');
    expect(confirmation).toBeDefined();
    expect(confirmation?.getAttribute("aria-modal")).toBe("false");
    const labelId = confirmation?.getAttribute("aria-labelledby") ?? "";
    const detailId = confirmation?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(labelId)?.textContent).toBe(
      "Delete this item?",
    );
    expect(document.getElementById(detailId)?.textContent).toBe(
      "This cannot be undone.",
    );
    expect(document.activeElement?.textContent).toBe("Keep item");

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
