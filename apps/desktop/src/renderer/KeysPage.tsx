import { Input } from "@doolittle/ui";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  WorkbenchAction,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import { ProviderIdentity } from "./connections/ProviderIdentity";
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
  useApiResource,
} from "./lib";

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
  // undefined picks the first loaded key; null keeps the new-key form open.
  const [selectedKey, setSelectedKey] = useState<string | null>();
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [revealedValue, setRevealedValue] = useState("");
  const [valueVisible, setValueVisible] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | "">("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [failedSaves, setFailedSaves] = useState<Set<string>>(() => new Set());
  const operationInFlight = useRef(false);
  const revealRevision = useRef(0);
  const keyNameRef = useRef<HTMLInputElement>(null);
  const clearSensitiveValue = useCallback(() => {
    revealRevision.current += 1;
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
    if (selectedKey === undefined && keys[0]) {
      setSelectedKey(keys[0]);
      setDraftKey(keys[0]);
    }
  }, [keys, selectedKey]);

  useEffect(() => {
    if (!revealedValue) return;
    const timeout = window.setTimeout(clearSensitiveValue, 60_000);
    return () => window.clearTimeout(timeout);
  }, [clearSensitiveValue, revealedValue]);

  useEffect(() => {
    const clearWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (revealedValue) clearSensitiveValue();
      else revealRevision.current += 1;
    };
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", clearWhenHidden);
  }, [clearSensitiveValue, revealedValue]);

  useEffect(() => {
    if (!active) clearSensitiveValue();
  }, [active, clearSensitiveValue]);

  const loadValue = async (key = draftKey.trim()) => {
    if (!active || !key || operationInFlight.current) return;
    operationInFlight.current = true;
    const revision = revealRevision.current;
    setBusy("load");
    setFeedback(null);
    try {
      const response = await desktopRequest<SecretValueResponse>(
        "/secrets/get",
        "POST",
        { key },
      );
      if (
        revision !== revealRevision.current ||
        document.visibilityState === "hidden"
      )
        return;
      if (typeof response.value !== "string") {
        setFeedback({
          message: `No stored value for ${key}.`,
          tone: "neutral",
        });
        return;
      }
      setSelectedKey(key);
      setDraftKey(key);
      setRevealedValue(response.value);
      setDraftValue(response.value);
      setValueVisible(true);
      setFeedback({ message: `Loaded ${key}.`, tone: "good" });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      operationInFlight.current = false;
      setBusy("");
    }
  };

  const saveValue = async (event: FormEvent) => {
    event.preventDefault();
    const key = draftKey.trim();
    if (!active || !key || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy("save");
    setFeedback(null);
    try {
      await desktopRequest("/secrets/set", "POST", {
        key,
        value: draftValue,
      });
      setFailedSaves((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setSelectedKey(key);
      clearSensitiveValue();
      setFeedback({ message: `Stored ${key}.`, tone: "good" });
      secrets.reload();
    } catch (error) {
      setFailedSaves((current) => new Set(current).add(key));
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      operationInFlight.current = false;
      setBusy("");
    }
  };

  return (
    <WorkbenchSection
      actions={
        <WorkbenchAction
          disabled={!active}
          icon={RefreshCw}
          onClick={secrets.reload}
        >
          Refresh
        </WorkbenchAction>
      }
      className="settings-workbench-section settings-keys-section provider-settings provider-settings--keys provider-settings--unframed"
      description="Manage credentials for this computer. The inventory loads key names only."
      icon={KeyRound}
      title="Secret store"
    >
      {!active ? (
        <OfflineRouteState>
          Local credentials cannot be inspected or changed until the runtime is
          ready.
        </OfflineRouteState>
      ) : (
        <div className="keys-workspace" data-inventory-empty={inventoryEmpty}>
          {!inventoryEmpty ? (
            <WorkbenchSection
              actions={
                <WorkbenchAction
                  disabled={Boolean(busy)}
                  emphasis="quiet"
                  icon={Plus}
                  onClick={() => {
                    setSelectedKey(null);
                    setDraftKey("");
                    clearSensitiveValue();
                    setFeedback(null);
                    keyNameRef.current?.focus();
                  }}
                >
                  New key
                </WorkbenchAction>
              }
              description={
                keys.length
                  ? `${keys.length} ${keys.length === 1 ? "key" : "keys"}`
                  : undefined
              }
              headingLevel={3}
              title="Secret inventory"
            >
              {secrets.loading ? (
                <LoadingBlock label="Loading secret names…" />
              ) : secrets.error ? (
                <ErrorBlock
                  error={secrets.error}
                  detail={secrets.errorDetail}
                  retry={secrets.reload}
                />
              ) : (
                <div className="keys-inventory-list">
                  {keys.map((key) => (
                    <button
                      aria-pressed={selectedKey === key}
                      className="keys-inventory-row"
                      disabled={Boolean(busy)}
                      key={key}
                      onClick={() => {
                        setSelectedKey(key);
                        setDraftKey(key);
                        clearSensitiveValue();
                        setFeedback(null);
                      }}
                      type="button"
                    >
                      <ProviderIdentity icon={KeyRound} />
                      <strong>{key}</strong>
                      {failedSaves.has(key) ? (
                        <Badge tone="bad">Save failed</Badge>
                      ) : selectedKey === key ? (
                        <Check aria-hidden="true" size={15} />
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </WorkbenchSection>
          ) : null}
          <WorkbenchSection
            description={
              inventoryEmpty
                ? "Save the first credential in this local store."
                : "Values stay concealed until you choose to reveal them."
            }
            headingLevel={3}
            icon={ShieldCheck}
            title={selectedKey ?? "Add a key"}
          >
            <form
              aria-busy={Boolean(busy)}
              aria-describedby={feedback ? "secret-editor-feedback" : undefined}
              className="keys-editor-form"
              onSubmit={saveValue}
            >
              <div className="model-fields keys-fields">
                <label htmlFor="secret-key-name">
                  <span>Key name</span>
                  <Input
                    disabled={Boolean(busy)}
                    id="secret-key-name"
                    placeholder="OPENAI_API_KEY"
                    ref={keyNameRef}
                    value={draftKey}
                    onChange={(event) => {
                      const nextKey = event.target.value;
                      if (revealedValue && nextKey.trim() !== draftKey.trim())
                        clearSensitiveValue();
                      setDraftKey(nextKey);
                    }}
                  />
                </label>
                <label htmlFor="secret-key-value">
                  <span>Value</span>
                  <Input
                    autoComplete="off"
                    disabled={Boolean(busy)}
                    id="secret-key-value"
                    placeholder="Paste the local secret value"
                    type={valueVisible ? "text" : "password"}
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                  />
                </label>
              </div>
              {feedback ? (
                <Notice id="secret-editor-feedback" tone={feedback.tone}>
                  {feedback.message}
                </Notice>
              ) : null}
              <div className="provider-form-actions">
                <WorkbenchAction
                  disabled={Boolean(busy) || !draftKey.trim()}
                  icon={Eye}
                  onClick={() => void loadValue()}
                >
                  {busy === "load" ? "Loading…" : "Reveal value"}
                </WorkbenchAction>
                <WorkbenchAction
                  disabled={Boolean(busy) || !draftKey.trim()}
                  emphasis="primary"
                  icon={Save}
                  type="submit"
                >
                  {busy === "save" ? "Saving…" : "Save key"}
                </WorkbenchAction>
                {draftValue ? (
                  <WorkbenchAction
                    emphasis="quiet"
                    icon={valueVisible ? EyeOff : Eye}
                    onClick={() => setValueVisible((current) => !current)}
                  >
                    {valueVisible ? "Hide value" : "Show value"}
                  </WorkbenchAction>
                ) : null}
              </div>
            </form>
            {revealedValue ? (
              <Notice tone="warn">
                The selected value is loaded into the protected editor above.
                <WorkbenchAction
                  emphasis="quiet"
                  icon={X}
                  onClick={clearSensitiveValue}
                >
                  Clear from renderer
                </WorkbenchAction>
              </Notice>
            ) : (
              <Notice tone="warn">
                Revealing a key copies its current value into the desktop
                renderer. Only do that when you need to inspect or replace it.
              </Notice>
            )}
          </WorkbenchSection>
        </div>
      )}
    </WorkbenchSection>
  );
}
