import { parseOpaqueRouteId } from "./routes/parse-opaque-id";

// Only sidecars started by the native operator host receive these routes. Keep
// the list explicit so a new product or SDK handler never acquires authority.
const READ = new Set([
  "/accounts",
  "/accounts/doctor",
  "/accounts/oauth/status",
  "/acp/editor",
  "/acp/package",
  "/acp/registry",
  "/acp/session/updates",
  "/acp/sessions",
  "/acp/status",
  "/acp/tool",
  "/acp/tools",
  "/activity",
  "/activity/export",
  "/analytics",
  "/autonomy/status",
  "/codegen/runs",
  "/codegen/workflows",
  "/commands/catalog",
  "/delegation/groups",
  "/delegation/overview",
  "/delegation/overview-snapshot",
  "/delegation/task-summaries",
  "/delegation/tasks",
  "/delegation/workers",
  "/deliveries",
  "/doctor",
  "/execution/backends",
  "/execution/status",
  "/experience/summary",
  "/forms",
  "/forms/templates",
  "/gateway/attachments",
  "/gateway/daemon",
  "/gateway/deliveries",
  "/gateway/history",
  "/gateway/inbox",
  "/gateway/ingress",
  "/gateway/journal",
  "/gateway/outbox",
  "/gateway/state",
  "/gateway/supervision",
  "/gateway/trace",
  "/gateway/transport-mismatches",
  "/gateway/transports",
  "/insights",
  "/logs",
  "/mcp/cached",
  "/mcp/cached/describe",
  "/mcp/cached/search",
  "/mcp/marketplace",
  "/mcp/marketplace/server",
  "/mcp/status",
  "/mcp/tool",
  "/mcp/tools",
  "/memory",
  "/memory/summary",
  "/pairing/approved",
  "/pairing/pending",
  "/personality",
  "/personality/summary",
  "/plans",
  "/platforms",
  "/profiles/agent",
  "/profiles/summary",
  "/profiles/users",
  "/profiles/users/card",
  "/profiles/users/search",
  "/repo/remotes",
  "/repo/stashes",
  "/review-record",
  "/runtime/account-pool",
  "/runtime/accounts",
  "/runtime/autonomous",
  "/runtime/codegen",
  "/runtime/compatibility",
  "/runtime/ecosystem",
  "/runtime/forms",
  "/runtime/ownership",
  "/runtime/planning",
  "/runtime/plugins",
  "/runtime/registry",
  "/runtime/services",
  "/runtime/transports",
  "/sessions/continuity",
  "/sessions/export",
  "/sessions/gateway",
  "/sessions/gateway/home",
  "/sessions/gateway/voice",
  "/sessions/search",
  "/sessions/summary",
  "/sessions/usage",
  "/settings",
  "/setup/checklist",
  "/setup/summary",
  "/skills",
  "/skills/catalog",
  "/skills/families",
  "/skills/generated",
  "/skills/generated/detail",
  "/skills/hub",
  "/skills/hub/distribution",
  "/skills/installed",
  "/skills/optional-packs",
  "/skills/proposals",
  "/skills/summary",
  "/theme",
  "/tools/category",
  "/tools/detail",
  "/tools/search",
  "/tools/summary",
  "/tools/transports",
  "/transport/inventory",
  "/transport/mismatches",
  "/transport/status",
  "/update/preview",
]);

const POST = new Set([
  "/accounts/connect",
  "/accounts/login",
  "/accounts/oauth/cancel",
  "/accounts/oauth/code",
  "/accounts/oauth/start",
  "/accounts/refresh",
  "/accounts/setup-token",
  "/accounts/use",
  "/acp/editor/context",
  "/acp/fs/read",
  "/acp/initialize",
  "/acp/probe",
  "/acp/session/cancel",
  "/acp/session/load",
  "/acp/session/new",
  "/acp/session/prompt",
  "/autonomy/disable",
  "/autonomy/enable",
  "/autonomy/interval",
  "/cron/jobs",
  "/delegation/tasks",
  "/delegation/tasks/bulk",
  "/execution/preview",
  "/forms/create",
  "/gateway/delivery/retry",
  "/gateway/replay",
  "/gateway/restart",
  "/gateway/start",
  "/gateway/stop",
  "/mcp/probe",
  "/pairing/approve",
  "/pairing/deny",
  "/pairing/revoke",
  "/personality",
  "/plans/create",
  "/review-record/comments",
  "/review-record/feedback-sent",
  "/runtime/executions/stop-all",
  "/sessions/fork",
  "/sessions/gateway/expire",
  "/sessions/gateway/home",
  "/sessions/gateway/voice",
  "/sessions/import",
  "/sessions/import/preview",
  "/sessions/title",
  "/settings",
  "/skills/proposals",
  "/theme",
  "/theme/next",
  "/theme/prev",
]);

const READ_DETAIL =
  /^(?:\/delegation\/tasks\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})(?:\/(?:children|tree))?|\/(?:codegen\/(?:runs|workflows)|forms|plans|skills\/(?:catalog|families|installed|manifest))\/([^/]{1,384}))$/u;
const CRON_JOB = /^\/cron\/jobs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ACCOUNT_BASE =
  /^\/runtime\/account-pool\/(?:openai-api|anthropic-api|openai-codex|anthropic-subscription)\//u;
const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SKILL_PROPOSAL =
  /^\/skills\/proposals\/skill-proposal-[0-9a-f-]{36}(?:\/(approve|reject))?$/u;

export function isNativeNamedBotRoute(method: string, path: string): boolean {
  if (path === "/bots") return method === "GET" || method === "POST";
  const bot =
    /^\/bots\/(?:default|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/(activate|stop|archive))?$/iu.exec(
      path,
    );
  return Boolean(bot && (bot[1] ? method === "POST" : method === "PATCH"));
}

export function isNativeSdkControlRoute(method: string, path: string): boolean {
  if (method === "GET") return path === "/autonomy/status";
  return (
    method === "POST" &&
    ["/autonomy/disable", "/autonomy/enable", "/autonomy/interval"].includes(
      path,
    )
  );
}

function nativeAccountControlAllowed(method: string, path: string): boolean {
  const prefix = ACCOUNT_BASE.exec(path)?.[0];
  if (!prefix) return false;
  const [id, action, extra] = path.slice(prefix.length).split("/");
  if (!id || extra !== undefined || !ACCOUNT_ID.test(id)) return false;
  if (method === "PATCH" || method === "DELETE") return action === undefined;
  if (method !== "POST") return false;
  if (action !== undefined)
    return action === "test" || action === "refresh-usage";
  if (id === "credentials")
    return /\/(?:openai-api|anthropic-api)\/$/u.test(prefix);
  return ["import", "select", "strategy"].includes(id);
}

export function nativeControlRouteAllowed(
  method: string,
  path: string,
): boolean {
  const skillProposal = SKILL_PROPOSAL.exec(path);
  if (skillProposal) return method === (skillProposal[1] ? "POST" : "GET");
  if (method === "GET") {
    const detail = READ_DETAIL.exec(path);
    return (
      READ.has(path) ||
      Boolean(detail && (detail[1] || parseOpaqueRouteId(detail[2])))
    );
  }
  if (nativeAccountControlAllowed(method, path)) return true;
  if (method === "PATCH" || method === "DELETE") {
    return (
      CRON_JOB.test(path) ||
      /^\/review-record\/comments\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(
        path,
      )
    );
  }
  if (method !== "POST") return false;
  if (POST.has(path)) return true;
  if (
    /^\/cron\/jobs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/(?:pause|resume|run|trigger)$/u.test(
      path,
    )
  )
    return true;
  if (
    /^\/delegation\/tasks\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/(?:note|retry|cancel|complete|fail)$/u.test(
      path,
    )
  )
    return true;
  const approval =
    /^\/execution\/approvals\/([^/]{1,768})\/(?:approve|deny)$/u.exec(
      path,
    )?.[1];
  if (approval) {
    try {
      return /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,255}$/u.test(
        decodeURIComponent(approval),
      );
    } catch {
      return false;
    }
  }
  const action =
    /^\/(?:plans\/([^/]{1,384})\/(?:approve|steer)|review-record\/comments\/([^/]{1,384})\/(?:resolve|reopen))$/u.exec(
      path,
    );
  return Boolean(action && parseOpaqueRouteId(action[1] ?? action[2]));
}
