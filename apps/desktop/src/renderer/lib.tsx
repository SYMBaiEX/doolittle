import { useFetchData } from "@elizaos/ui/hooks/useFetchData";
import type { DependencyList, ReactNode } from "react";
import { desktopRequest } from "./eliza-client";

export { desktopRequest } from "./eliza-client";

export type UnknownRecord = Record<string, unknown>;
export { asRecord } from "./value-guards";

export interface ApiResource<T> {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(
      /^Error invoking remote method ['"]?agent:request['"]?:\s*(?:Error:\s*)?/iu,
      "",
    )
    .replace(/^Error:\s*/iu, "")
    .trim();
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/gu, " ")
    .replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function displayTimestamp(value?: string): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function useApiResource<T>(
  path: string | null,
  dependencies: DependencyList = [],
): ApiResource<T> {
  const resource = useFetchData<T | null>(
    (signal) =>
      path
        ? desktopRequest<T>(path, "GET", undefined, signal)
        : Promise.resolve(null),
    [path, ...dependencies],
  );

  return {
    data: resource.status === "success" ? resource.data : null,
    error: resource.status === "error" ? errorMessage(resource.error) : "",
    loading: Boolean(path) && resource.status === "loading",
    reload: resource.refetch,
  };
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Notice({
  announce,
  children,
  id,
  tone = "neutral",
}: {
  announce?: "alert" | "status" | "off";
  children: ReactNode;
  id?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const role =
    announce === "off"
      ? undefined
      : (announce ?? (tone === "bad" ? "alert" : undefined));
  return (
    <div className={`notice ${tone}`} id={id} role={role}>
      {children}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div aria-live="polite" className="loading-block" role="status">
      <div aria-hidden="true" className="loading-skeleton">
        <i />
        <i />
        <i />
      </div>
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  const runtimeOffline = /local runtime is not ready/iu.test(error);
  return (
    <Notice tone="bad">
      <strong>
        {runtimeOffline ? "Runtime is offline." : "Could not load this view."}
      </strong>
      <span>
        {runtimeOffline
          ? "Restart the local runtime, then try this view again."
          : errorMessage(error)}
      </span>
      {retry ? (
        <button className="text-button" onClick={retry} type="button">
          Try again
        </button>
      ) : null}
    </Notice>
  );
}

export function EmptyBlock({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-block">
      <div className="empty-glyph" aria-hidden="true">
        ∴
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function formatDataPreview(
  value: unknown,
  maxCharacters = 30_000,
): string {
  let formatted: string;
  try {
    formatted = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    formatted = String(value);
  }
  return formatted.length <= maxCharacters
    ? formatted
    : `${formatted.slice(0, maxCharacters)}\n… (${formatted.length - maxCharacters} more characters)`;
}

export function RawDataDisclosure({
  label,
  value,
  defaultOpen = false,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const formatted = formatDataPreview(value);
  return (
    <details className="raw-data-disclosure" open={defaultOpen}>
      <summary>
        <span>{label}</span>
        <small>{formatted.length.toLocaleString()} characters</small>
      </summary>
      <pre className="json-preview">{formatted}</pre>
    </details>
  );
}

export function Icon({
  name,
}: {
  name:
    | "dashboard"
    | "chat"
    | "code"
    | "browser"
    | "review"
    | "orchestration"
    | "sessions"
    | "activity"
    | "analytics"
    | "media"
    | "models"
    | "connections"
    | "tools"
    | "skills"
    | "plugins"
    | "memory"
    | "automations"
    | "profiles"
    | "logs"
    | "keys"
    | "settings"
    | "docs"
    | "runtime"
    | "compatibility"
    | "registry"
    | "operatorSetup";
}) {
  const paths: Record<typeof name, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
      </>
    ),
    chat: <path d="M4 5.5h16v11H9l-5 4v-15Z" />,
    code: (
      <>
        <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M14 4l-4 16" />
      </>
    ),
    browser: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 8h18M7 6h.01M10 6h.01M6 12h6M6 15h10" />
      </>
    ),
    review: (
      <>
        <path d="M4 4h16v16H4zM8 9l2 2 5-5M8 16h8" />
      </>
    ),
    orchestration: (
      <>
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M12 7.5v4.5M6 15.5V13h12v2.5" />
      </>
    ),
    sessions: (
      <>
        <path d="M6 4h14v13H8l-4 3V6a2 2 0 0 1 2-2Z" />
        <path d="M8 8h8M8 12h6" />
      </>
    ),
    activity: <path d="M3 12h4l2.2-5 4.3 10 2.1-5H21M5 4v16m14-16v16" />,
    analytics: <path d="M5 19V9m7 10V5m7 14v-7M3 19h18" />,
    media: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m4 17 5-5 3 3 2-2 6 5M15 7l2 2m0-2-2 2" />
      </>
    ),
    models: (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
    connections: (
      <>
        <path d="M8 12H4m16 0h-4M9 7l3-3 3 3m-6 10 3 3 3-3" />
        <rect x="8" y="8" width="8" height="8" rx="2" />
      </>
    ),
    tools: <path d="m14 6 4-4 4 4-4 4m-4-4L4 16v4h4L18 10M3 3l6 6" />,
    skills: (
      <>
        <path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z" />
      </>
    ),
    plugins: <path d="M9 3v5H4v5h5v8h6v-8h5V8h-5V3h-6Zm0 10h6" />,
    memory: (
      <>
        <path d="M8 6a4 4 0 0 1 7-2 4 4 0 0 1 2 7 4 4 0 0 1-2 7 4 4 0 0 1-7 0 4 4 0 0 1-2-7 4 4 0 0 1 2-5Z" />
        <path d="M10 7v10m4-11v12M7 10h10m-9 4h9" />
      </>
    ),
    automations: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    profiles: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    logs: <path d="M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h5" />,
    keys: (
      <>
        <path d="M8.5 12a3.5 3.5 0 1 1 3.2 3.48H9.5v2H7.5v2H5.5v-3.2l3.8-3.8A3.46 3.46 0 0 1 8.5 12Z" />
        <path d="M15.5 10.5h2m-1-1v2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m19 13 2 2-2 3-3-1-2 2-1 3H9l-1-3-2-2-3 1-2-3 2-2v-3L1 8l2-3 3 1 2-2 1-3h4l1 3 2 2 3-1 2 3-2 2v3Z" />
      </>
    ),
    docs: <path d="M5 3h11l3 3v15H5zM15 3v4h4M8 11h8m-8 4h8" />,
    runtime: <path d="M4 5.5h16v11H4zM4 9h16M9 13h4" />,
    compatibility: (
      <>
        <path d="m12 3 3.5 6 6.5 1-4.7 4.5 1.1 7.1L12 20.5 7 21.6l1.1-7.1L3.5 10l6.5-1Z" />
        <path d="M12 15.5h.01" />
      </>
    ),
    registry: (
      <>
        <path d="M5 7h14v10H5zM8 4h8M8 20h8M9 10h6M9 13h2M9 16h4" />
        <path d="M11 7V4" />
      </>
    ),
    operatorSetup: (
      <>
        <path d="M12 3a5 5 0 0 1 0 10 5 5 0 0 1 0-10Zm0 12v-3" />
        <path d="M12 17c-3 0-5 1-6 2v2h12v-2c-1-1-3-2-6-2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      {paths[name]}
    </svg>
  );
}
