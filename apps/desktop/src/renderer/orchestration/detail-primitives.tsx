import type { ReactNode } from "react";
import { orchestrationClass as oc } from "./layout";

export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined;
}) {
  return (
    <div className={oc("orchestration-detail-row")}>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

export function SmallEmpty({ children }: { children: string }) {
  return <p className={oc("orchestration-empty-line")}>{children}</p>;
}

export function DetailTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span className={oc("orchestration-detail-tag", tone)}>{children}</span>
  );
}

export function statusTone(
  status: string,
): "good" | "warn" | "bad" | "neutral" {
  const normalized = status.toLowerCase();
  if (["completed", "done", "success"].includes(normalized)) return "good";
  if (["failed", "cancelled", "error", "stalled"].includes(normalized)) {
    return "bad";
  }
  if (["running", "queued", "pending", "active"].includes(normalized)) {
    return "warn";
  }
  return "neutral";
}
