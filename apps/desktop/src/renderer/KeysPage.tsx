import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ActionFeedback,
  asArray,
  asString,
  Badge,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
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

  const loadValue = async (key = draftKey.trim()) => {
    if (!key) return;
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
    if (!key) return;
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
    <div className="page page-keys">
      <PageHeader
        eyebrow="Credentials"
        title="Keys"
        description="Inspect which local secrets exist, reveal a value on demand, and update provider credentials from the desktop shell."
        actions={
          <button
            className="secondary-button"
            onClick={secrets.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {feedback ? (
        <Notice tone={feedback.tone}>{feedback.message}</Notice>
      ) : null}
      <div className="split-workspace">
        <section className="list-panel">
          <div className="detail-toolbar">
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
            <div className="list-scroll">
              {keys.map((key) => (
                <button
                  className={`row-card ${selectedKey === key ? "selected" : ""}`}
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
                  <span className="row-card-main">
                    <strong>{key}</strong>
                    <small>Stored locally</small>
                  </span>
                </button>
              ))}
              {!keys.length ? (
                <EmptyBlock title="No stored keys">
                  Add your first provider or tool credential from the form.
                </EmptyBlock>
              ) : null}
            </div>
          )}
        </section>
        <section className="detail-panel">
          <div className="detail-toolbar">
            <div>
              <span className="eyebrow">Local secret store</span>
              <h2>{draftKey || "Add or update a key"}</h2>
            </div>
            {selectedKey ? <Badge>{selectedKey}</Badge> : null}
          </div>
          <form className="content-card form-card" onSubmit={saveValue}>
            <div className="field-grid">
              <label className="field-span">
                <span>Key name</span>
                <input
                  placeholder="OPENAI_API_KEY"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                />
              </label>
              <label className="field-span">
                <span>Value</span>
                <input
                  autoComplete="off"
                  placeholder="Paste the local secret value"
                  type={valueVisible ? "text" : "password"}
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                disabled={busy === "load" || !draftKey.trim()}
                onClick={() => void loadValue()}
                type="button"
              >
                {busy === "load" ? "Loading…" : "Reveal stored value"}
              </button>
              <button
                className="primary-button"
                disabled={busy === "save" || !draftKey.trim()}
                type="submit"
              >
                {busy === "save" ? "Saving…" : "Save key"}
              </button>
              {draftValue ? (
                <button
                  className="text-button"
                  onClick={() => setValueVisible((current) => !current)}
                  type="button"
                >
                  {valueVisible ? "Hide value" : "Show value"}
                </button>
              ) : null}
            </div>
          </form>
          <div className="metric-grid compact" style={{ marginTop: "14px" }}>
            <MetricCard label="Known keys" value={keys.length} />
            <MetricCard
              label="Selected key"
              value={draftKey || "None"}
              detail="Names are listed without values."
            />
            <MetricCard
              label="Renderer access"
              value={revealedValue ? "Explicit" : "Protected"}
              detail="Values are returned only on demand."
            />
            <MetricCard label="Storage" value="Local only" />
          </div>
          {revealedValue ? (
            <Notice tone="warn">
              The selected value is loaded into the protected editor above.
              <button
                className="text-button"
                onClick={clearSensitiveValue}
                type="button"
              >
                Clear from renderer
              </button>
            </Notice>
          ) : (
            <Notice tone="warn">
              Revealing a key copies its current value into the desktop
              renderer. Only do that when you need to inspect or replace it.
            </Notice>
          )}
        </section>
      </div>
    </div>
  );
}
