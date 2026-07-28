import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { clampPanelWidth } from "../panel-layout";
import "./panel-resize-handle.css";

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
  direction: "grow-left" | "grow-right";
  label: string;
  onResize: (value: number) => void;
  value: number;
}) {
  const resizeStart = (event: ReactPointerEvent<HTMLHRElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = value;
    document.documentElement.dataset.panelResizing = "true";

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const next =
        direction === "grow-right" ? startWidth + delta : startWidth - delta;
      onResize(clampPanelWidth(next, bounds));
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
    const horizontalDelta =
      event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
    if (!horizontalDelta) return;
    event.preventDefault();
    const widthDelta =
      direction === "grow-right" ? horizontalDelta : -horizontalDelta;
    onResize(clampPanelWidth(value + widthDelta, bounds));
  };

  return (
    <hr
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={bounds.max}
      aria-valuemin={bounds.min}
      aria-valuenow={value}
      className={`panel-resize-handle ${className}`}
      onDoubleClick={() => onResize(bounds.default)}
      onKeyDown={resizeWithKeyboard}
      onPointerDown={resizeStart}
      tabIndex={0}
      title={`${label}. Drag or use arrow keys. Double-click to reset.`}
    />
  );
}
