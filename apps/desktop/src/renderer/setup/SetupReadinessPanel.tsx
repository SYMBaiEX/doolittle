import { Badge } from "../lib";
import type { SetupReadinessView } from "./setup-model";

export function SetupReadinessPanel({
  readiness,
}: {
  readiness: SetupReadinessView;
}) {
  return (
    <section
      aria-labelledby="setup-readiness-title"
      className={`setup-readiness is-${readiness.tone}`}
    >
      <div className="setup-readiness__heading">
        <div>
          <span className="eyebrow">Local readiness</span>
          <h2 id="setup-readiness-title">{readiness.title}</h2>
        </div>
        <Badge tone={readiness.tone}>{readiness.label}</Badge>
      </div>
      <p>{readiness.detail}</p>
    </section>
  );
}
