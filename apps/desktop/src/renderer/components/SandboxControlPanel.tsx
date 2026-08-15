import { Button } from "@elizaos/ui/components/ui/button";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";
import { desktopRequest } from "../eliza-client";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  errorMessage,
} from "../lib";
import {
  EXECUTION_ACTIONS_CLASS,
  EXECUTION_CARD_CLASS,
  EXECUTION_CONTROL_CLASS,
  EXECUTION_DESCRIPTION_CLASS,
  EXECUTION_EYEBROW_CLASS,
  EXECUTION_FIELD_CLASS,
  EXECUTION_NOTICE_CLASS,
  EXECUTION_RESULT_PRE_CLASS,
} from "./execution-environment-layout";

export type LocalSandbox = {
  id: string;
  path: string;
  template: "node-js" | "python" | string;
  createdAt: string;
};

export type LocalSandboxControl = {
  available: boolean;
  activeSandboxId: string;
  supportsExecution: boolean;
  detail: string;
};

export type LocalSandboxResult = {
  success: boolean;
  text: string;
  stdout: string;
  stderr: string;
  language: string;
  sandboxId: string;
  error: string;
};

type SandboxSnapshot = {
  control: LocalSandboxControl;
  sandboxes: LocalSandbox[];
};

const OUTPUT_LIMIT = 12_000;

function boundedText(value: unknown): string {
  const text = asString(value);
  return text.length > OUTPUT_LIMIT
    ? `${text.slice(0, OUTPUT_LIMIT)}\n… output truncated in the desktop view`
    : text;
}

export function normalizeLocalSandboxControl(
  value: unknown,
): LocalSandboxControl {
  const record = asRecord(value);
  return {
    available: record.available === true,
    activeSandboxId: asString(record.activeSandboxId).trim(),
    supportsExecution: record.supportsExecution === true,
    detail: asString(record.detail).trim(),
  };
}

export function normalizeLocalSandboxes(value: unknown): LocalSandbox[] {
  return asArray(value)
    .map((entry): LocalSandbox | null => {
      const record = asRecord(entry);
      const id = asString(record.id).trim();
      if (!id) return null;
      return {
        id,
        path: asString(record.path).trim(),
        template: asString(record.template).trim() || "unknown",
        createdAt: asString(record.createdAt).trim(),
      };
    })
    .filter((sandbox): sandbox is LocalSandbox => sandbox !== null);
}

export function normalizeLocalSandboxResult(
  value: unknown,
): LocalSandboxResult {
  const record = asRecord(value);
  const errorRecord = asRecord(record.error);
  return {
    success: record.success === true,
    text: boundedText(record.text),
    stdout: boundedText(record.stdout),
    stderr: boundedText(record.stderr),
    language: asString(record.language).trim(),
    sandboxId: asString(record.sandboxId).trim(),
    error: boundedText(errorRecord.value),
  };
}

function isConflict(cause: unknown): boolean {
  return /\b409\b|sandbox (is )?(closing|changing)|ownership conflict/iu.test(
    errorMessage(cause),
  );
}

function sandboxLabel(sandbox: LocalSandbox): string {
  return `${sandbox.template} · ${sandbox.id}`;
}

export function SandboxControlPanel({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("print('Sandbox ready')");
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LocalSandboxResult | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await desktopRequest<{
        control?: unknown;
        sandboxes?: unknown;
      }>("/e2b/sandboxes");
      const next: SandboxSnapshot = {
        control: normalizeLocalSandboxControl(response.control),
        sandboxes: normalizeLocalSandboxes(response.sandboxes),
      };
      setSnapshot(next);
      setSelectedId((current) =>
        next.sandboxes.some((sandbox) => sandbox.id === current)
          ? current
          : next.control.activeSandboxId || next.sandboxes[0]?.id || "",
      );
    } catch (cause) {
      setSnapshot(null);
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [active, refresh]);

  const runMutation = async (operation: () => Promise<void>) => {
    if (mutating) return;
    setMutating(true);
    setError("");
    setRetry(null);
    try {
      await operation();
    } catch (cause) {
      const message = errorMessage(cause);
      setError(
        isConflict(cause)
          ? `${message} The sandbox state changed; refresh and retry the operation.`
          : message,
      );
      if (isConflict(cause)) setRetry(() => () => void refresh());
    } finally {
      setMutating(false);
    }
  };

  const createSandbox = (template: "node-js" | "python") =>
    runMutation(async () => {
      const response = await desktopRequest<{ sandboxId?: unknown }>(
        "/e2b/sandboxes",
        "POST",
        { template },
      );
      const createdId = asString(response.sandboxId).trim();
      await refresh();
      if (createdId) setSelectedId(createdId);
    });

  const execute = () =>
    runMutation(async () => {
      if (!selectedId || !code.trim()) return;
      const response = await desktopRequest<{ result?: unknown }>(
        "/e2b/execute",
        "POST",
        { code, language, sandboxId: selectedId },
      );
      setResult(normalizeLocalSandboxResult(response.result));
      await refresh();
    });

  const kill = () =>
    runMutation(async () => {
      if (!selectedId) return;
      await desktopRequest("/e2b/kill", "POST", { id: selectedId });
      setResult(null);
      await refresh();
    });

  const selected = useMemo(
    () => snapshot?.sandboxes.find((sandbox) => sandbox.id === selectedId),
    [selectedId, snapshot],
  );
  const available = snapshot?.control.available === true;
  const canExecute =
    active && available && snapshot?.control.supportsExecution === true;

  return (
    <section
      aria-label="Local sandbox environments"
      className={EXECUTION_CARD_CLASS}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-start gap-[3px]">
          <span className={EXECUTION_EYEBROW_CLASS}>Sandbox isolation</span>
          <strong className="text-[11px]">Eliza SandboxManager</strong>
        </div>
        <Badge tone={available ? "good" : "warn"}>
          {loading ? "Checking" : available ? "Available" : "Unavailable"}
        </Badge>
      </div>
      <p className={EXECUTION_DESCRIPTION_CLASS}>
        Local container isolation managed by Eliza SandboxManager. It is not a
        cloud E2B service; creation, execution, and cleanup remain under this
        desktop operator’s control.
      </p>

      <div className={EXECUTION_ACTIONS_CLASS}>
        <Button
          disabled={!active || loading || mutating || !available}
          onClick={() => void createSandbox("node-js")}
          size="sm"
          type="button"
          variant="outline"
        >
          New Node.js
        </Button>
        <Button
          disabled={!active || loading || mutating || !available}
          onClick={() => void createSandbox("python")}
          size="sm"
          type="button"
          variant="outline"
        >
          New Python
        </Button>
        <Button
          disabled={!active || loading || mutating}
          onClick={() => void refresh()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <div
          className={`${EXECUTION_NOTICE_CLASS} text-[var(--bad)]`}
          role="alert"
        >
          {error}
          {retry ? (
            <Button onClick={retry} size="sm" type="button" variant="ghost">
              Refresh state
            </Button>
          ) : null}
        </div>
      ) : null}

      {!loading && !available ? (
        <EmptyBlock title="Sandbox service unavailable">
          {snapshot?.control.detail ||
            "Start the local runtime with the Doolittle SandboxManager plugin to use isolated containers."}
        </EmptyBlock>
      ) : null}

      {available ? (
        <>
          <label className={EXECUTION_FIELD_CLASS}>
            <span>Execution target</span>
            <select
              className={EXECUTION_CONTROL_CLASS}
              disabled={!active || mutating || !snapshot?.sandboxes.length}
              onChange={(event) => setSelectedId(event.target.value)}
              value={selectedId}
            >
              {!snapshot?.sandboxes.length ? (
                <option value="">No active sandbox</option>
              ) : null}
              {snapshot?.sandboxes.map((sandbox) => (
                <option key={sandbox.id} value={sandbox.id}>
                  {sandboxLabel(sandbox)}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]">
              Target: <code>{selected.id}</code>
              {selected.path ? ` · ${selected.path}` : ""}
            </small>
          ) : null}
          {snapshot?.control.activeSandboxId ? (
            <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]">
              Active runtime sandbox:{" "}
              <code>{snapshot.control.activeSandboxId}</code>
            </small>
          ) : null}
          {!snapshot?.sandboxes.length ? (
            <EmptyBlock title="No active sandboxes">
              Create a local Node.js or Python container before executing code.
            </EmptyBlock>
          ) : (
            <>
              <label
                className={EXECUTION_FIELD_CLASS}
                htmlFor="sandbox-language"
              >
                <span>Language</span>
                <select
                  className={EXECUTION_CONTROL_CLASS}
                  disabled={!canExecute || mutating}
                  id="sandbox-language"
                  onChange={(event) => setLanguage(event.target.value)}
                  value={language}
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="bash">Bash</option>
                </select>
              </label>
              <label className={EXECUTION_FIELD_CLASS} htmlFor="sandbox-code">
                <span>{language} code</span>
                <Textarea
                  className="min-h-[86px] resize-y font-[var(--font-mono)]"
                  disabled={!canExecute || mutating}
                  id="sandbox-code"
                  onChange={(event) => setCode(event.target.value)}
                  spellCheck={false}
                  value={code}
                />
              </label>
              <div className={EXECUTION_ACTIONS_CLASS}>
                <Button
                  disabled={
                    !canExecute || !selectedId || !code.trim() || mutating
                  }
                  onClick={() => void execute()}
                  size="sm"
                  type="button"
                >
                  {mutating ? "Working…" : "Run in selected sandbox"}
                </Button>
                <Button
                  disabled={!active || !selectedId || mutating}
                  onClick={() => void kill()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Kill selected
                </Button>
              </div>
            </>
          )}
        </>
      ) : null}

      {result ? (
        <div
          className={`grid gap-1.5 rounded-[var(--radius-xs)] border p-2 ${
            result.success ? "border-[var(--border)]" : "border-[var(--bad)]"
          }`}
          data-success={result.success}
        >
          <strong>
            {result.success ? "Execution completed" : "Execution failed"}
          </strong>
          {result.text ? (
            <pre className={EXECUTION_RESULT_PRE_CLASS}>{result.text}</pre>
          ) : null}
          {result.stdout ? (
            <div>
              <span>stdout</span>
              <pre className={EXECUTION_RESULT_PRE_CLASS}>{result.stdout}</pre>
            </div>
          ) : null}
          {result.stderr ? (
            <div>
              <span>stderr</span>
              <pre className={EXECUTION_RESULT_PRE_CLASS}>{result.stderr}</pre>
            </div>
          ) : null}
          {result.error ? (
            <div>
              <span>error</span>
              <pre className={EXECUTION_RESULT_PRE_CLASS}>{result.error}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
