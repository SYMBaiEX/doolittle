import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  type ActionFeedback,
  asArray,
  asString,
  Badge,
  desktopRequest,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";

const KEYS_PAGE_CLASS = "page gap-4";

const KEYS_TOOLBAR_CLASS =
  "flex items-start justify-between gap-4 [&>div]:grid [&>div]:gap-0.5 [&_h2]:mt-1 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.015em]";

const KEYS_FIELD_CLASS =
  "flex min-w-0 flex-col gap-1 [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:font-bold [&>span]:tracking-[0.05em] [&>span]:text-[var(--text-soft)] [&>span]:uppercase";

interface SecretsResponse {
  keys?: unknown[];
}

interface SecretValueResponse {
  key?: string;
  value?: string | null;
}

export function KeysPage({ active }: { active: boolean }) {
  const secrets = useApiResource<SecretsResponse>(active ? "/secrets" : null, [
    active,
  ]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [revealedValue, setRevealedValue] = useState("");
  const [valueVisible, setValueVisible] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | "">("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const clearSensitiveValue = useCallback(() => {
    setDraftValue("");
    setRevealedValue("");
    setValueVisible(false);
  }, []);

  const keys = useMemo(
    () =>
      asArray(secrets.data?.keys)
        .map((value) => asString(value))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [secrets.data],
  );
  const inventoryEmpty =
    !secrets.loading && !secrets.error && keys.length === 0;

  useEffect(() => {
    if (!selectedKey && keys[0]) {
      setSelectedKey(keys[0]);
      setDraftKey(keys[0]);
    }
  }, [keys, selectedKey]);

  useEffect(() => {
    if (!revealedValue) return;
    const timeout = window.setTimeout(clearSensitiveValue, 60_000);
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") clearSensitiveValue();
    };
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", clearWhenHidden);
    };
  }, [clearSensitiveValue, revealedValue]);

  useEffect(() => {
    if (!active) clearSensitiveValue();
  }, [active, clearSensitiveValue]);

  const loadValue = async (key = draftKey.trim()) => {
    if (!active || !key) return;
    setBusy("load");
    setFeedback(null);
    try {
      const response = await desktopRequest<SecretValueResponse>(
        "/secrets/get",
        "POST",
        { key },
      );
      setSelectedKey(key);
      setDraftKey(key);
      setRevealedValue(asString(response.value));
      setDraftValue(asString(response.value));
      setValueVisible(true);
      setFeedback({ message: `Loaded ${key}.`, tone: "good" });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const saveValue = async (event: FormEvent) => {
    event.preventDefault();
    const key = draftKey.trim();
    if (!active || !key) return;
    setBusy("save");
    setFeedback(null);
    try {
      await desktopRequest("/secrets/set", "POST", {
        key,
        value: draftValue,
      });
      setSelectedKey(key);
      clearSensitiveValue();
      setFeedback({ message: `Stored ${key}.`, tone: "good" });
      secrets.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={KEYS_PAGE_CLASS}>
      <PageHeader
        eyebrow="Credentials"
        title="Keys"
        description="Inspect, reveal, and update credentials in the local secret store."
        actions={
          <Button
            disabled={!active}
            onClick={secrets.reload}
            type="button"
            variant="secondary"
          >
            Refresh
          </Button>
        }
      />
      {active && feedback ? (
        <Notice tone={feedback.tone}>{feedback.message}</Notice>
      ) : null}
      {!active ? (
        <OfflineRouteState>
          Local credentials cannot be inspected or changed until the runtime is
          ready.
        </OfflineRouteState>
      ) : (
        <div
          className={
            inventoryEmpty
              ? "grid min-h-0 w-[min(100%,1120px)] flex-none self-center grid-cols-1 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface)]"
              : "grid min-h-0 grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] overflow-auto rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface)]"
          }
          data-inventory-empty={inventoryEmpty ? "true" : undefined}
        >
          {inventoryEmpty ? null : (
            <section className="flex max-h-[min(36svh,360px)] min-h-0 min-w-0 flex-col border-b border-[var(--border)] p-[9px]">
              <div className={KEYS_TOOLBAR_CLASS}>
                <div>
                  <span className="eyebrow">Known keys</span>
                  <h2>Secret inventory</h2>
                </div>
                <Badge>{keys.length}</Badge>
              </div>
              {secrets.loading ? (
                <LoadingBlock label="Loading secret names…" />
              ) : secrets.error ? (
                <ErrorBlock error={secrets.error} retry={secrets.reload} />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                  {keys.map((key) => (
                    <button
                      className={`relative grid min-h-[52px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[var(--radius-sm)] border px-[var(--row-pad)] py-[var(--row-pad)] text-left ${
                        selectedKey === key
                          ? "border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-hover))] before:absolute before:inset-y-1.5 before:left-[-1px] before:w-0.5 before:bg-[var(--accent)] before:content-['']"
                          : "border-transparent bg-transparent hover:bg-[var(--surface-soft)]"
                      }`}
                      key={key}
                      onClick={() => {
                        setSelectedKey(key);
                        setDraftKey(key);
                        setDraftValue("");
                        setRevealedValue("");
                        setValueVisible(false);
                        setFeedback(null);
                      }}
                      type="button"
                    >
                      <span className="flex min-w-0 flex-col gap-1 [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[length:var(--text-meta)]">
                        <strong>{key}</strong>
                        <small>Stored locally</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          <section
            className={
              inventoryEmpty
                ? "grid min-h-0 min-w-0 grid-cols-[minmax(180px,0.42fr)_minmax(0,1.58fr)] gap-x-3.5 gap-y-2 p-[11px_13px] max-[800px]:grid-cols-1"
                : "flex min-h-0 min-w-0 flex-col overflow-auto p-4 [scrollbar-gutter:stable]"
            }
          >
            <div
              className={`${KEYS_TOOLBAR_CLASS} ${
                inventoryEmpty
                  ? "col-start-1 row-start-1 border-r border-[var(--border)] py-[3px] pr-[13px] max-[800px]:col-start-1 max-[800px]:row-auto max-[800px]:border-r-0 max-[800px]:border-b max-[800px]:px-0 max-[800px]:pt-0 max-[800px]:pb-2"
                  : "border-b border-[var(--border)] pb-[15px]"
              } [&_small]:max-w-[34rem] [&_small]:text-[length:var(--text-meta)] [&_small]:leading-[1.4] [&_small]:text-[var(--muted)]`}
            >
              <div>
                <span className="eyebrow">Local secret store</span>
                <h2>{draftKey || "Add or update a key"}</h2>
                <small>
                  {inventoryEmpty
                    ? "No stored keys. Save the first credential here."
                    : "Values remain concealed until you request one."}
                </small>
              </div>
            </div>
            <form
              className={`keys-editor-form rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,var(--surface))] p-[10px_11px] ${
                inventoryEmpty
                  ? "col-start-2 row-start-1 max-[800px]:col-start-1 max-[800px]:row-auto"
                  : "mt-4"
              }`}
              onSubmit={saveValue}
            >
              <div className="grid grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)] gap-x-3 gap-y-[11px] max-[800px]:grid-cols-1">
                <label className={KEYS_FIELD_CLASS} htmlFor="secret-key-name">
                  <span>Key name</span>
                  <Input
                    id="secret-key-name"
                    placeholder="OPENAI_API_KEY"
                    value={draftKey}
                    onChange={(event) => setDraftKey(event.target.value)}
                  />
                </label>
                <label className={KEYS_FIELD_CLASS} htmlFor="secret-key-value">
                  <span>Value</span>
                  <Input
                    autoComplete="off"
                    id="secret-key-value"
                    placeholder="Paste the local secret value"
                    type={valueVisible ? "text" : "password"}
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-[7px] flex items-center justify-end gap-2 border-t border-[var(--border)] pt-[7px]">
                <Button
                  disabled={busy === "load" || !draftKey.trim()}
                  onClick={() => void loadValue()}
                  type="button"
                  variant="secondary"
                >
                  {busy === "load" ? "Loading…" : "Reveal value"}
                </Button>
                <Button
                  disabled={busy === "save" || !draftKey.trim()}
                  type="submit"
                >
                  {busy === "save" ? "Saving…" : "Save key"}
                </Button>
                {draftValue ? (
                  <Button
                    onClick={() => setValueVisible((current) => !current)}
                    type="button"
                    variant="ghost"
                  >
                    {valueVisible ? "Hide value" : "Show value"}
                  </Button>
                ) : null}
              </div>
            </form>
            {revealedValue ? (
              <Notice tone="warn">
                The selected value is loaded into the protected editor above.
                <Button
                  onClick={clearSensitiveValue}
                  type="button"
                  variant="ghost"
                >
                  Clear from renderer
                </Button>
              </Notice>
            ) : (
              <Notice tone="warn">
                Revealing a key copies its current value into the desktop
                renderer. Only do that when you need to inspect or replace it.
              </Notice>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
