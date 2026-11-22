import { Activity, ArrowUpRight, ChartNoAxesColumn } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import { WorkbenchSection } from "../components/workbench/Workbench";
import { DASHBOARD_SPLIT_CLASS } from "./dashboard-layout";

const HOME_GATEWAYS = [
  {
    description: "Review agent work, outcomes, and runtime events.",
    href: "#/home/activity",
    icon: Activity,
    label: "Open activity",
    title: "Activity",
  },
  {
    description: "Inspect local session and context estimates.",
    href: "#/home/insights",
    icon: ChartNoAxesColumn,
    label: "Open insights",
    title: "Insights",
  },
] as const;

/**
 * Home links to the full observability routes without taking ownership of
 * their feeds, filters, export state, or drawer-local activity state.
 */
export function HomeObservabilityLinks() {
  return (
    <WorkbenchSection icon={Activity} title="Workspace activity">
      <nav
        aria-label="Observability"
        className={DASHBOARD_SPLIT_CLASS}
        data-home-observability-links
      >
        {HOME_GATEWAYS.map((gateway) => (
          <a
            aria-label={gateway.label}
            className="dashboard-action-row"
            href={gateway.href}
            key={gateway.href}
          >
            <span className="dashboard-action-mark">
              <UiIcon icon={gateway.icon} size="sm" />
            </span>
            <span className="dashboard-action-copy">
              <strong>{gateway.title}</strong>
              <small>{gateway.description}</small>
            </span>
            <UiIcon icon={ArrowUpRight} size="sm" />
          </a>
        ))}
      </nav>
    </WorkbenchSection>
  );
}
