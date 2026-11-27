import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { canonicalizeSlashCommandSyntax } from "@doolittle/agent/runtime/command-catalog";
import { listCliJobs } from "../jobs/index";
import type { CliJobRecord } from "../jobs/types";
import {
  clipControlDeckLine,
  clipControlDeckText,
  escapeControlDeckBlessed,
  normalizeControlDeckWidth,
  renderControlDeckHeading,
} from "./width";

function jobStatusColor(status: CliJobRecord["status"]): string {
  if (status === "completed") return "green-fg";
  if (status === "running") return "yellow-fg";
  if (status === "failed") return "red-fg";
  if (status === "cancelled") return "magenta-fg";
  return "cyan-fg";
}

function renderJobStatusLine(job: CliJobRecord, width: number): string {
  const idWidth = width >= 24 ? 8 : 4;
  const plain = `- ${job.id.slice(0, idWidth)} [${job.status}]`;
  if (plain.length > width) {
    return clipControlDeckLine(plain, width);
  }
  return `- ${job.id.slice(0, idWidth)} {${jobStatusColor(job.status)}}[${job.status}]{/}`;
}

function renderJobTimingLine(job: CliJobRecord, width: number): string {
  const full = job.completedAt
    ? `  done=${job.completedAt.slice(11, 19)} exit=${job.exitCode ?? "n/a"}`
    : job.startedAt
      ? `  started=${job.startedAt.slice(11, 19)} pid=${job.pid ?? "n/a"}`
      : `  queued=${job.createdAt.slice(11, 19)}`;
  if (full.length <= width) {
    return full;
  }

  const compact = job.completedAt
    ? `  exit=${job.exitCode ?? "n/a"}`
    : job.startedAt
      ? `  pid=${job.pid ?? "n/a"}`
      : "  queued";
  return compact.length <= width
    ? compact
    : clipControlDeckLine(compact, width);
}

function renderJob(job: CliJobRecord, width: number): string {
  const promptPrefix = "  prompt=";
  const prompt = clipControlDeckText(job.prompt, width - promptPrefix.length);
  return [
    renderJobStatusLine(job, width),
    `${promptPrefix}${escapeControlDeckBlessed(prompt)}`,
    renderJobTimingLine(job, width),
  ].join("\n");
}

function fitShellCommand(command: string, width: number): string {
  return clipControlDeckLine(`- ${command}`, width);
}

export function renderJobsContent(context: AppContext, width = 80): string {
  const contentWidth = normalizeControlDeckWidth(width);
  const jobs = listCliJobs(context.config.dataDir).slice(0, 8);
  return [
    renderControlDeckHeading("Background Jobs", "Jobs", contentWidth),
    `Tracked: ${jobs.length}`,
    "",
    ...(jobs.length
      ? jobs.map((job) => renderJob(job, contentWidth))
      : [
          `{gray-fg}${escapeControlDeckBlessed(clipControlDeckText("No detached jobs yet.", contentWidth))}{/}`,
        ]),
    "",
    renderControlDeckHeading("Shell Surface", "Shell", contentWidth),
    fitShellCommand(canonicalizeSlashCommandSyntax("/jobs"), contentWidth),
    fitShellCommand(
      canonicalizeSlashCommandSyntax("/jobs show <id>"),
      contentWidth,
    ),
    fitShellCommand(
      canonicalizeSlashCommandSyntax("/jobs attach <id>"),
      contentWidth,
    ),
    fitShellCommand(
      canonicalizeSlashCommandSyntax("/jobs cancel <id>"),
      contentWidth,
    ),
  ].join("\n");
}
