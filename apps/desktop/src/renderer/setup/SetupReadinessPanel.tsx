import {
  SETUP_READINESS_CLASS,
  SETUP_READINESS_HEADING_CLASS,
  setupReadinessSignalClass,
} from "../diagnostics-layout";
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
      className={SETUP_READINESS_CLASS}
      data-readiness-tone={readiness.tone}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-0.5 ${setupReadinessSignalClass(readiness.tone)}`}
      />
      <div className={SETUP_READINESS_HEADING_CLASS}>
        <div>
          <span className="eyebrow">Local readiness</span>
          <h2 id="setup-readiness-title">{readiness.title}</h2>
        </div>
        <Badge tone={readiness.tone}>{readiness.label}</Badge>
      </div>
      <p className="m-0 max-w-[82ch] text-[var(--text-control)] leading-[1.45] text-[var(--text-soft)]">
        {readiness.detail}
      </p>
    </section>
  );
}
