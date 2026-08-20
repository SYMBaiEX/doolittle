import type { LucideIcon } from "lucide-react";

const sizeClass = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
} as const;

export type UiIconSize = keyof typeof sizeClass;

export function UiIcon({
  icon: Icon,
  size = "sm",
  label,
  className = "",
}: {
  icon: LucideIcon;
  size?: UiIconSize;
  label?: string;
  className?: string;
}) {
  return (
    <Icon
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`${sizeClass[size]} shrink-0 stroke-[1.8] ${className}`.trim()}
      focusable="false"
      role={label ? "img" : undefined}
    />
  );
}
