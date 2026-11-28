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
import { terminalGlyph } from "./terminal-glyphs";
import {
  currentProjectLabel,
  macAwareKeyLabel,
  shortModelId,
} from "./terminal-labels";
import { resolveCockpitRailContentWidth } from "./tui-layout";

function clipInline(text: string, width: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (footerTextWidth(normalized) <= width) return normalized;
  if (width <= 0) return "";
  const ellipsis = terminalGlyph("…", "...");
  const ellipsisWidth = footerTextWidth(ellipsis);
  if (width <= ellipsisWidth) return takeFooterTextPrefix(ellipsis, width);
  return `${takeFooterTextPrefix(normalized, width - ellipsisWidth)}${ellipsis}`;
}

function inlineSeparator(): string {
  return ` ${terminalGlyph("·", "|")} `;
}

function resolveStatusContentWidth(width?: number): number {
  if (width !== undefined) {
    return Math.max(1, Math.floor(width));
  }
  return resolveCockpitRailContentWidth(stdout.columns ?? 80);
}

function valueWidth(width: number, label: string): number {
  return Math.max(4, width - label.length);
}

export function renderStatusContent(
  context: AppContext,
  state: CliState,
  width?: number,
): string {
  const contentWidth = resolveStatusContentWidth(width);
  const compact = contentWidth < 48;
  const separator = inlineSeparator();
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
  const projectLabel = currentProjectLabel();
  const workspaceSessionLines = compact
    ? [
        `workspace {cyan-fg}${escapeBlessed(clipInline(projectLabel, valueWidth(contentWidth, "workspace ")))}{/}`,
        `session ${escapeBlessed(clipInline(snapshot.sessionLabel, valueWidth(contentWidth, "session ")))}`,
      ]
    : (() => {
        const fixedWidth = `workspace ${separator}session `.length;
        const budget = Math.max(16, contentWidth - fixedWidth);
        const projectWidth = Math.max(8, Math.floor(budget * 0.45));
        const sessionWidth = Math.max(8, budget - projectWidth);
        return [
          `workspace {cyan-fg}${escapeBlessed(clipInline(projectLabel, projectWidth))}{/}${separator}session ${escapeBlessed(clipInline(snapshot.sessionLabel, sessionWidth))}`,
        ];
      })();
  const modelLines = compact
    ? [
        `provider {cyan-fg}${escapeBlessed(clipInline(settings.model.provider, valueWidth(contentWidth, "provider ")))}{/}`,
        `model {cyan-fg}${escapeBlessed(clipInline(settings.model.model, valueWidth(contentWidth, "model ")))}{/}`,
      ]
    : [
        `{cyan-fg}${escapeBlessed(clipInline(settings.model.provider, Math.max(8, Math.floor((contentWidth - 3) / 2))))}{/}${separator}{cyan-fg}${escapeBlessed(clipInline(settings.model.model, Math.max(8, Math.ceil((contentWidth - 3) / 2))))}{/}`,
      ];
  const connection = autonomousControl.alignment.connection;
  const connectionSummary = clipInline(
    `${connection.kind}${connection.provider ? ` via ${connection.provider}` : ""}`,
    contentWidth,
  );
  const startupSummary = clipInline(
    snapshot.startupSummary,
    valueWidth(contentWidth, "startup "),
  );
  const runSummary = clipInline(
    `run ${settings.agent.runDepth}${separator}cap ${settings.agent.maxIterations}${separator}progress ${settings.agent.toolProgressMode}`,
    contentWidth,
  );
  const liveLine = activeRun
    ? (() => {
        const elapsed = formatElapsedMs(getRunElapsedMs(activeRun));
        let line = `live ${activeRun.status}${separator}${activeRun.observedActionCount} steps`;
        if (
          elapsed &&
          line.length + elapsed.length + separator.length <= contentWidth
        ) {
          line += `${separator}${elapsed}`;
        }
        const detail = activeRun.activeAction || activeRun.statusDetail;
        const detailWidth = contentWidth - line.length - separator.length;
        if (detail && detailWidth >= 8) {
          line += `${separator}${clipInline(detail, detailWidth)}`;
        }
        return escapeBlessed(line);
      })()
    : "{gray-fg}live idle{/}";
  const hydrationSummary = clipInline(
    `hydration gw:${startup.phases.gateway.status} cron:${startup.phases.cron.status} diag:${startup.phases.diagnostics.status} skills:${startup.phases.skills.status}`,
    contentWidth,
  );
  const delegationSummary = clipInline(
    `delegation ${delegation.running}/${delegation.pending}/${delegation.completed}${separator}workers ${delegation.activeWorkers}`,
    contentWidth,
  );
  const gatewaySummary = clipInline(
    `gateway sessions ${gatewaySessions.length}${separator}voice ${gatewaySessions.filter((entry) => entry.voiceMode).length}`,
    contentWidth,
  );
  const focusTarget = active?.title ?? state.activeSessionId;

  return [
    "{bold}Operator Snapshot{/}",
    `{gray-fg}${escapeBlessed(clipInline(`${theme.sigil} ${theme.label} ${runStatusFace(theme, activeRun?.status)}`, contentWidth))}{/}`,
    ...workspaceSessionLines,
    ...modelLines,
    escapeBlessed(connectionSummary),
    `startup ${escapeBlessed(startupSummary)}`,
    escapeBlessed(runSummary),
    liveLine,
    escapeBlessed(hydrationSummary),
    `channels ${escapeBlessed(clipInline(snapshot.transportSummary, valueWidth(contentWidth, "channels ")))}`,
    escapeBlessed(delegationSummary),
    escapeBlessed(gatewaySummary),
    `focus ${escapeBlessed(clipInline(focusTarget, valueWidth(contentWidth, "focus ")))}`,
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
          const messageWidth = Math.max(4, contentWidth - entry.at.length - 5);
          return `${accent} {gray-fg}${escapeBlessed(entry.at)}{/} ${escapeBlessed(clipInline(entry.message, messageWidth))}`;
        })
      : ["{gray-fg}No active notices.{/}"]),
    "",
    "{bold}Native Surface{/}",
    `plugins ${escapeBlessed(clipInline(snapshot.pluginSummary, valueWidth(contentWidth, "plugins ")))}`,
    `runtime {gray-fg}${escapeBlessed(clipInline(audit.runtime.beta, valueWidth(contentWidth, "runtime ")))}{/}`,
    "",
    "{bold}Next Step{/}",
    escapeBlessed(clipInline(snapshot.nextCockpitHint, contentWidth)),
    "",
    "{bold}Recent Sessions{/}",
    ...sessions.slice(0, 4).map((entry) => {
      const marker = entry.sessionId === state.activeSessionId ? "*" : "-";
      return `${marker} ${escapeBlessed(clipInline(entry.title ?? entry.sessionId, contentWidth - 2))}`;
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
  busyFrame = terminalGlyph("•", "*"),
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
