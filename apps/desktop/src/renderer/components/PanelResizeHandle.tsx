import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { clampPanelSize } from "../panel-layout";

export type PanelResizeDirection =
  | "grow-left"
  | "grow-right"
  | "grow-up"
  | "grow-down";

export function PanelResizeHandle({
  bounds,
  className,
  direction,
  label,
  onResize,
  value,
}: {
  bounds: { default: number; min: number; max: number };
  className: string;
  direction: PanelResizeDirection;
  label: string;
  onResize: (value: number) => void;
  value: number;
}) {
  const resizesHeight = direction === "grow-up" || direction === "grow-down";
  const growsWithPointer =
    direction === "grow-right" || direction === "grow-down";

  const resizeStart = (event: ReactPointerEvent<HTMLHRElement>) => {
    event.preventDefault();
    const startPosition = resizesHeight ? event.clientY : event.clientX;
    const startSize = value;
    const root = document.documentElement;
    const body = document.body;
    const previousRootCursor = root.style.cursor;
    const previousRootSelection = root.style.userSelect;
    const previousBodyCursor = body.style.cursor;
    const previousBodySelection = body.style.userSelect;
    root.dataset.panelResizing = resizesHeight ? "vertical" : "horizontal";
    root.style.cursor = resizesHeight ? "row-resize" : "col-resize";
    root.style.userSelect = "none";
    body.style.cursor = root.style.cursor;
    body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const pointerPosition = resizesHeight
        ? moveEvent.clientY
        : moveEvent.clientX;
      const delta = pointerPosition - startPosition;
      const next = growsWithPointer ? startSize + delta : startSize - delta;
      onResize(clampPanelSize(next, bounds));
    };
    const onEnd = () => {
      delete root.dataset.panelResizing;
      root.style.cursor = previousRootCursor;
      root.style.userSelect = previousRootSelection;
      body.style.cursor = previousBodyCursor;
      body.style.userSelect = previousBodySelection;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLHRElement>) => {
    const pointerDelta = resizesHeight
      ? event.key === "ArrowUp"
        ? -16
        : event.key === "ArrowDown"
          ? 16
          : 0
      : event.key === "ArrowLeft"
        ? -16
        : event.key === "ArrowRight"
          ? 16
          : 0;
    if (!pointerDelta) return;
    event.preventDefault();
    const sizeDelta = growsWithPointer ? pointerDelta : -pointerDelta;
    onResize(clampPanelSize(value + sizeDelta, bounds));
  };

  return (
    <div
      className={`panel-resize-handle group absolute z-45 m-0 border-0 bg-transparent p-0 outline-none touch-none [-webkit-app-region:no-drag] ${
        resizesHeight
          ? "h-2.5 min-h-2.5 w-auto min-w-0 cursor-row-resize"
          : "h-auto min-h-0 w-2.5 min-w-2.5 cursor-col-resize"
      } ${className}`}
    >
      <hr
        aria-label={label}
        aria-orientation={resizesHeight ? "horizontal" : "vertical"}
        aria-valuemax={bounds.max}
        aria-valuemin={bounds.min}
        aria-valuenow={value}
        className="absolute inset-0 m-0 size-full cursor-inherit border-0 bg-transparent p-0 outline-none touch-none [-webkit-app-region:no-drag]"
        onDoubleClick={() => onResize(bounds.default)}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={resizeStart}
        tabIndex={0}
        title={`${label}. Drag or use ${
          resizesHeight ? "up and down" : "left and right"
        } arrow keys. Double-click to reset.`}
      />
      <span
        aria-hidden="true"
        className={`absolute bg-transparent transition-[background,box-shadow] duration-120 group-hover:bg-[var(--accent)] group-hover:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_42%,transparent)] group-focus-visible:bg-[var(--accent)] group-focus-visible:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_42%,transparent)] motion-reduce:transition-none ${
          resizesHeight ? "top-1 right-0 left-0 h-px" : "inset-y-0 left-1 w-px"
        }`}
      />
    </div>
  );
}
