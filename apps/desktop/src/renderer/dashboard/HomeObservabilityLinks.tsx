import {
  DASHBOARD_CARD_CLASS,
  DASHBOARD_CARD_HEADING_CLASS,
  DASHBOARD_MINI_GRID_CLASS,
} from "./dashboard-layout";

const HOME_GATEWAYS = [
  {
    description: "Review agent work, outcomes, and runtime events.",
    href: "#/home/activity",
    label: "Open activity",
    title: "Activity",
  },
  {
    description: "Inspect local session and context estimates.",
    href: "#/home/insights",
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
    <div className={DASHBOARD_MINI_GRID_CLASS} data-home-observability-links>
      {HOME_GATEWAYS.map((gateway) => (
        <section className={DASHBOARD_CARD_CLASS} key={gateway.title}>
          <div className={DASHBOARD_CARD_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Home</span>
              <h2>{gateway.title}</h2>
              <small>{gateway.description}</small>
            </div>
            <a className="secondary-button shrink-0" href={gateway.href}>
              {gateway.label}
            </a>
          </div>
        </section>
      ))}
    </div>
  );
}
