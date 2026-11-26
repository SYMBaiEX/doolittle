import { stdout } from "node:process";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { getNativePackageAudit } from "@doolittle/agent/runtime/native/package-audit";
import { getAutonomousControlPlane } from "@doolittle/agent/runtime/native/service-bridge/autonomous";
import {
  formatElapsedMs,
  getRunElapsedMs,
} from "@doolittle/agent/runtime/run-progress";
import {
  getTuiTheme,
  type TuiThemeProfile,
} from "@doolittle/agent/runtime/theme-catalog";
import blessed from "blessed";
import { runStatusFace } from "./activity-chrome";
import type { CliState } from "./execution/index";
import { buildCliOperatorSnapshot } from "./operator-snapshot";
import { escapeBlessed } from "./render-utils";
import {
  currentProjectLabel,
  macAwareKeyLabel,
  shortModelId,
} from "./terminal-labels";
import { truncate } from "./text-utils";

export function renderStatusContent(
  context: AppContext,
  state: CliState,
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const snapshot = buildCliOperatorSnapshot(context, state);
  const activeRun = context.services.runController.getActive(
    state.activeSessionId,
  );
  const audit = getNativePackageAudit(context.config);
  const sessions = context.services.sessions.listSessions(6);
  const delegation = context.services.delegationProjection.overview();
  const gatewaySessions = context.services.gatewaySessions.list();
  const autonomousControl = getAutonomousControlPlane(
    context.runtime,
    context.services,
    context.config,
  );
  const startup = context.services.startupState.getSnapshot();
  const active = sessions.find(
    (entry) => entry.sessionId === state.activeSessionId,
  );

  return [
    "{bold}Operator Snapshot{/}",
    `{gray-fg}${escapeBlessed(theme.sigil)} ${escapeBlessed(theme.label)} ${escapeBlessed(runStatusFace(theme, activeRun?.status))}{/}`,
    `workspace {cyan-fg}${escapeBlessed(currentProjectLabel())}{/} · session ${escapeBlessed(truncate(snapshot.sessionLabel, 28))}`,
    `{cyan-fg}${settings.model.provider}{/} · {cyan-fg}${escapeBlessed(settings.model.model)}{/}`,
    `${escapeBlessed(autonomousControl.alignment.connection.kind)}${autonomousControl.alignment.connection.provider ? ` via ${escapeBlessed(autonomousControl.alignment.connection.provider)}` : ""}`,
    `startup ${escapeBlessed(snapshot.startupSummary)}`,
    `run ${settings.agent.runDepth} · cap ${settings.agent.maxIterations} · progress ${settings.agent.toolProgressMode}`,
    activeRun
      ? (() => {
          const elapsed = formatElapsedMs(getRunElapsedMs(activeRun));
          const tail = activeRun.activeAction
            ? ` · ${escapeBlessed(truncate(activeRun.activeAction, 26))}`
            : activeRun.statusDetail
              ? ` · ${escapeBlessed(truncate(activeRun.statusDetail, 26))}`
              : "";
          return `live ${activeRun.status}${elapsed ? ` · ${escapeBlessed(elapsed)}` : ""} · ${activeRun.observedActionCount} steps${tail}`;
        })()
      : "{gray-fg}live idle{/}",
    `hydration gw:${startup.phases.gateway.status} cron:${startup.phases.cron.status} diag:${startup.phases.diagnostics.status} skills:${startup.phases.skills.status}`,
    `channels ${escapeBlessed(snapshot.transportSummary)}`,
    `delegation ${delegation.running}/${delegation.pending}/${delegation.completed} · workers ${delegation.activeWorkers}`,
    `gateway sessions ${gatewaySessions.length} · voice ${gatewaySessions.filter((entry) => entry.voiceMode).length}`,
    active?.title
      ? `focus ${truncate(active.title, 28)}`
      : `focus ${state.activeSessionId}`,
    "",
    "{bold}Live Notices{/}",
    ...(state.notices.length
      ? state.notices.slice(0, 3).map((entry) => {
          const accent =
            entry.kind === "context"
              ? "{yellow-fg}CTX{/}"
              : entry.kind === "skills"
                ? "{magenta-fg}SKL{/}"
                : "{cyan-fg}SYS{/}";
          return `${accent} {gray-fg}${escapeBlessed(entry.at)}{/} ${escapeBlessed(truncate(entry.message, 84))}`;
        })
      : ["{gray-fg}No active notices.{/}"]),
    "",
    "{bold}Native Surface{/}",
    `plugins ${escapeBlessed(snapshot.pluginSummary)}`,
    `runtime {gray-fg}${escapeBlessed(audit.runtime.beta)}{/}`,
    "",
    "{bold}Next Step{/}",
    escapeBlessed(snapshot.nextCockpitHint),
    "",
    "{bold}Recent Sessions{/}",
    ...sessions.slice(0, 4).map((entry) => {
      const marker = entry.sessionId === state.activeSessionId ? "*" : "-";
      return `${marker} ${truncate(entry.title ?? entry.sessionId, 26)}`;
    }),
  ].join("\n");
}

const FOOTER_WIDE_SEPARATOR = "  |  ";
const FOOTER_COMPACT_SEPARATOR = " | ";

const blessedUnicode = (
  blessed as unknown as {
    unicode?: { strWidth?: (text: string) => number };
  }
).unicode;

function footerTextWidth(text: string): number {
  return blessedUnicode?.strWidth?.(text) ?? Array.from(text).length;
}

function takeFooterTextPrefix(text: string, width: number): string {
  let output = "";
  let used = 0;
  for (const char of Array.from(text)) {
    const charWidth = footerTextWidth(char);
    if (used + charWidth > width) break;
    output += char;
    used += charWidth;
  }
  return output;
}

function truncateFooterText(text: string, width: number): string {
  if (footerTextWidth(text) <= width) return text;
  if (width <= 0) return "";
  if (width <= 3) return takeFooterTextPrefix(text, width);
  return `${takeFooterTextPrefix(text, width - 3)}...`;
}

function compactFooterHint(hint: string): string {
  return hint
    .replace(/\s+/gu, " ")
    .replace(/ (↑\/↓) history$/u, " $1")
    .trim();
}

type FooterOptionalVariant = "full" | "compact" | "dropped";

interface FooterPlan {
  separator: string;
  commands: FooterOptionalVariant;
  hint: FooterOptionalVariant;
  quit: "full" | "compact";
  compactStatus: boolean;
  compactQueue: boolean;
  includeAgentSigil: boolean;
  agentName: string;
  model: string;
}

interface FooterSegment {
  plain: string;
  rendered: string;
}

function buildFooterSegments(
  theme: TuiThemeProfile,
  busy: boolean,
  queueDepth: number,
  hint: string,
  busyFrame: string,
  plan: FooterPlan,
): FooterSegment[] {
  const agent = plan.includeAgentSigil
    ? `${theme.sigil} ${plan.agentName}`
    : plan.agentName;
  const status = plan.compactStatus
    ? busy
      ? "busy"
      : "ready"
    : busy
      ? `${busyFrame} processing`
      : `${theme.idleFace} ready`;
  const queue = plan.compactQueue ? `q:${queueDepth}` : `queue:${queueDepth}`;
  const segments: FooterSegment[] = [
    { plain: agent, rendered: escapeBlessed(agent) },
    {
      plain: status,
      rendered: busy
        ? `{yellow-fg}${escapeBlessed(status)}{/}`
        : `{green-fg}${escapeBlessed(status)}{/}`,
    },
    {
      plain: queue,
      rendered:
        queueDepth > 0
          ? `{cyan-fg}${escapeBlessed(queue)}{/}`
          : `{gray-fg}${escapeBlessed(queue)}{/}`,
    },
    {
      plain: plan.model,
      rendered: `{cyan-fg}${escapeBlessed(plan.model)}{/}`,
    },
  ];

  if (plan.commands !== "dropped") {
    const key = plan.commands === "compact" ? "^P" : macAwareKeyLabel("Ctrl-P");
    segments.push({
      plain: `${key} commands`,
      rendered: `{cyan-fg}${escapeBlessed(key)}{/} commands`,
    });
  }

  if (plan.hint !== "dropped") {
    const text = plan.hint === "compact" ? compactFooterHint(hint) : hint;
    if (text) {
      segments.push({ plain: text, rendered: escapeBlessed(text) });
    }
  }

  const quitKey = plan.quit === "compact" ? "^Q" : macAwareKeyLabel("Ctrl-Q");
  segments.push({
    plain: `${quitKey} quit`,
    rendered: `{cyan-fg}${escapeBlessed(quitKey)}{/} quit`,
  });
  return segments;
}

function buildFooterLine(
  theme: TuiThemeProfile,
  busy: boolean,
  queueDepth: number,
  hint: string,
  busyFrame: string,
  plan: FooterPlan,
): { content: string; width: number } {
  const segments = buildFooterSegments(
    theme,
    busy,
    queueDepth,
    hint,
    busyFrame,
    plan,
  );
  const separatorWidth = footerTextWidth(plan.separator);
  const width =
    segments.reduce(
      (total, segment) => total + footerTextWidth(segment.plain),
      0,
    ) +
    separatorWidth * Math.max(0, segments.length - 1);
  return {
    content: segments.map((segment) => segment.rendered).join(plan.separator),
    width,
  };
}

function resolveFooterWidth(width: number | undefined): number {
  const columns = width ?? stdout.columns ?? 80;
  return Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 80;
}

/**
 * Width-aware footer copy. State segments are never dropped; affordances first
 * compact, then yield in priority order (context hint, palette, essentials).
 * The quit binding is the final affordance and remains visible at every
 * supported cockpit width (80 columns and above), compacting to caret notation
 * rather than hard-clipping.
 */
export function renderFooter(
  context: AppContext,
  busy: boolean,
  queueDepth: number,
  hint = "Esc input",
  busyFrame = "•",
  width?: number,
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const availableWidth = resolveFooterWidth(width);
  const plan: FooterPlan = {
    separator: FOOTER_WIDE_SEPARATOR,
    commands: "full",
    hint: "full",
    quit: "full",
    compactStatus: false,
    compactQueue: false,
    includeAgentSigil: true,
    agentName: context.config.agentName,
    model: shortModelId(settings.model.model),
  };

  const build = () =>
    buildFooterLine(theme, busy, queueDepth, hint, busyFrame, plan);
  let line = build();
  if (line.width <= availableWidth) return line.content;

  plan.separator = FOOTER_COMPACT_SEPARATOR;
  line = build();
  if (line.width <= availableWidth) return line.content;

  const compactionSteps: Array<() => void> = [
    () => {
      plan.hint = "compact";
    },
    () => {
      plan.commands = "compact";
    },
    () => {
      plan.quit = "compact";
    },
    () => {
      plan.hint = "dropped";
    },
    () => {
      plan.commands = "dropped";
    },
    () => {
      plan.compactStatus = true;
    },
    () => {
      plan.includeAgentSigil = false;
    },
    () => {
      plan.compactQueue = true;
    },
  ];

  for (const compact of compactionSteps) {
    compact();
    line = build();
    if (line.width <= availableWidth) return line.content;
  }

  // Extremely long agent or model names yield pressure only after every
  // affordance has compacted or dropped. Shrink the longer identity field with
  // an explicit ellipsis; blessed therefore never has to hard-clip a token.
  while (line.width > availableWidth) {
    const overflow = line.width - availableWidth;
    const agentWidth = footerTextWidth(plan.agentName);
    const modelWidth = footerTextWidth(plan.model);
    const canShrinkAgent = agentWidth > 1;
    const canShrinkModel = modelWidth > 1;
    if (!canShrinkAgent && !canShrinkModel) break;

    if (canShrinkModel && (!canShrinkAgent || modelWidth >= agentWidth)) {
      plan.model = truncateFooterText(
        plan.model,
        Math.max(1, modelWidth - overflow),
      );
    } else {
      plan.agentName = truncateFooterText(
        plan.agentName,
        Math.max(1, agentWidth - overflow),
      );
    }

    const next = build();
    if (next.width >= line.width) {
      line = next;
      break;
    }
    line = next;
  }

  return line.content;
}
