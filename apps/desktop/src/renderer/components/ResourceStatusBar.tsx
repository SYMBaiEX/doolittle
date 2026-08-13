import type { ReactNode } from "react";
import {
  type ResourceStatusItem,
  resourceStatusLabel,
  summarizeResourceStatuses,
} from "../resource-status";
import "./resource-status.css";

export function ResourceStatusBar({
  resources,
  children,
}: {
  resources: readonly ResourceStatusItem[];
  children?: ReactNode;
}) {
  const summary = summarizeResourceStatuses(resources);
  const failedResources = resources.filter(
    ({ resource }) =>
      resource.status === "error" ||
      (!resource.status && Boolean(resource.error) && !resource.data),
  );
  const retry = () => {
    for (const { resource } of failedResources) resource.reload();
  };
  const failed = summary.required.errors + summary.optional.errors > 0;
  const pending = summary.required.pending + summary.optional.pending > 0;
  const requiredUnavailable =
    summary.required.errors > 0 && summary.required.ready === 0;
  const hasCustomRetry = Boolean(children);
  return (
    <div
      aria-atomic="true"
      aria-busy={pending || summary.isValidating}
      aria-live={requiredUnavailable ? "assertive" : "polite"}
      className="resource-status-bar"
      role={requiredUnavailable ? "alert" : "status"}
    >
      <span
        className={`resource-status-bar__indicator resource-status-bar__indicator--${summary.status}`}
        aria-hidden="true"
      />
      <span>
        {summary.hasData && failed
          ? "Partially available"
          : resourceStatusLabel(summary.status)}
      </span>
      <span className="resource-status-bar__counts">
        {summary.required.ready}/{summary.required.total} required
        {summary.optional.total
          ? ` · ${summary.optional.ready}/${summary.optional.total} optional`
          : ""}
      </span>
      {failed && !hasCustomRetry ? (
        <button className="text-button" onClick={retry} type="button">
          Retry failed
        </button>
      ) : null}
      {children}
    </div>
  );
}
