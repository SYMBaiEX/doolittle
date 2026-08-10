import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { clampPanelSize } from "../panel-layout";
import "./panel-resize-handle.css";

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
    document.documentElement.dataset.panelResizing = resizesHeight
      ? "vertical"
      : "horizontal";

    const onMove = (moveEvent: PointerEvent) => {
      const pointerPosition = resizesHeight
        ? moveEvent.clientY
        : moveEvent.clientX;
      const delta = pointerPosition - startPosition;
      const next = growsWithPointer ? startSize + delta : startSize - delta;
      onResize(clampPanelSize(next, bounds));
    };
    const onEnd = () => {
      delete document.documentElement.dataset.panelResizing;
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
    <hr
      aria-label={label}
      aria-orientation={resizesHeight ? "horizontal" : "vertical"}
      aria-valuemax={bounds.max}
      aria-valuemin={bounds.min}
      aria-valuenow={value}
      className={`panel-resize-handle ${className}`}
      onDoubleClick={() => onResize(bounds.default)}
      onKeyDown={resizeWithKeyboard}
      onPointerDown={resizeStart}
      tabIndex={0}
      title={`${label}. Drag or use ${
        resizesHeight ? "up and down" : "left and right"
      } arrow keys. Double-click to reset.`}
    />
  );
}
