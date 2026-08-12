import { useMemo, useReducer, useState } from "react";
import {
  type BrowserAction,
  type BrowserResult,
  buildBrowserResultViewModel,
} from "../browser-result-model";
import {
  asRecord,
  asString,
  desktopRequest,
  errorMessage,
  titleCase,
  useApiResource,
} from "../lib";
import {
  type BrowserPreviewSize,
  browserNavigationReducer,
  INITIAL_BROWSER_NAVIGATION,
  isLocalPreviewUrl,
  normalizeBrowserUrl,
} from "./browser-navigation";

interface BrowserStatusResponse {
  browser?: unknown;
}

export type BrowserErrorField = "address" | "compare" | null;

export const BROWSER_ACTIONS: Array<{
  id: BrowserAction;
  label: string;
  detail: string;
}> = [
  { id: "inspect", label: "Inspect", detail: "DOM and page metadata" },
  { id: "capture", label: "Capture", detail: "Reusable evidence bundle" },
  { id: "screenshot", label: "Screenshot", detail: "Raster page artifact" },
  { id: "snapshot", label: "Snapshot", detail: "Readable page snapshot" },
  { id: "analyze", label: "Analyze", detail: "Model-backed review" },
];

export function useBrowserWorkspace(active: boolean) {
  const [navigation, dispatchNavigation] = useReducer(
    browserNavigationReducer,
    INITIAL_BROWSER_NAVIGATION,
  );
  const [previewSize, setPreviewSize] =
    useState<BrowserPreviewSize>("responsive");
  const [compareUrl, setCompareUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<BrowserErrorField>(null);
  const [result, setResult] = useState<BrowserResult | null>(null);
  const status = useApiResource<BrowserStatusResponse>(
    active ? "/browser/status" : null,
    [active],
  );
  const statusRecord = asRecord(status.data?.browser);
  const embedded =
    Boolean(navigation.currentUrl) && isLocalPreviewUrl(navigation.currentUrl);
  const statusLabel =
    asString(statusRecord.mode) ||
    asString(statusRecord.captureMode) ||
    (status.loading ? "Checking" : "Available");
  const resultView = useMemo(
    () => (result ? buildBrowserResultViewModel(result) : null),
    [result],
  );
  const resultStatusMessage = useMemo(() => {
    if (busy) return `${titleCase(busy)} in progress.`;
    if (error) return `Browser error: ${error}`;
    if (result && resultView) {
      return `${result.title} ready. ${resultView.summary}.`;
    }
    return "Browser tool idle.";
  }, [busy, error, result, resultView]);

  const clearError = () => {
    setError("");
    setErrorField(null);
  };

  const fail = (cause: unknown, field: BrowserErrorField = null) => {
    setError(errorMessage(cause));
    setErrorField(field);
  };

  const updateAddress = (address: string) => {
    dispatchNavigation({ type: "edit-address", address });
    if (errorField === "address") clearError();
  };

  const updateCompareUrl = (url: string) => {
    setCompareUrl(url);
    if (errorField === "compare") clearError();
  };

  const navigate = () => {
    if (!active) return;
    clearError();
    try {
      dispatchNavigation({
        type: "show-url",
        url: normalizeBrowserUrl(navigation.address),
        recordHistory: true,
      });
    } catch (navigationError) {
      fail(navigationError, "address");
    }
  };

  const travelHistory = (direction: -1 | 1) => {
    if (!active) return;
    dispatchNavigation({ type: "travel", direction });
  };

  const reloadPreview = () => {
    if (!active) return;
    clearError();
    try {
      const url = normalizeBrowserUrl(
        navigation.currentUrl || navigation.address,
      );
      dispatchNavigation({ type: "clear-preview" });
      requestAnimationFrame(() => {
        dispatchNavigation({ type: "show-url", url });
      });
    } catch (navigationError) {
      fail(navigationError, "address");
    }
  };

  const runAction = async (action: BrowserAction) => {
    if (!active) return;
    clearError();
    let url = "";
    try {
      url = normalizeBrowserUrl(navigation.currentUrl || navigation.address);
    } catch (validationError) {
      fail(validationError, "address");
      return;
    }
    setBusy(action);
    try {
      const payload =
        action === "inspect"
          ? await desktopRequest<unknown>(
              `/browser/inspect?url=${encodeURIComponent(url)}`,
            )
          : await desktopRequest<unknown>(`/browser/${action}`, "POST", {
              url,
            });
      dispatchNavigation({ type: "show-url", url, recordHistory: true });
      setResult({
        action,
        title: `${BROWSER_ACTIONS.find((entry) => entry.id === action)?.label ?? action} result`,
        payload,
      });
    } catch (actionError) {
      fail(actionError);
    } finally {
      setBusy("");
    }
  };

  const compare = async (analyze: boolean) => {
    if (!active) return;
    clearError();
    let leftUrl = "";
    let rightUrl = "";
    try {
      leftUrl = normalizeBrowserUrl(
        navigation.currentUrl || navigation.address,
      );
    } catch (validationError) {
      fail(validationError, "address");
      return;
    }
    try {
      rightUrl = normalizeBrowserUrl(compareUrl);
    } catch (validationError) {
      fail(validationError, "compare");
      return;
    }
    const action = analyze ? "compare-analyze" : "compare";
    setBusy(action);
    try {
      const payload = await desktopRequest<unknown>(
        analyze ? "/browser/compare/analyze" : "/browser/compare",
        "POST",
        { leftUrl, rightUrl },
      );
      setResult({
        action,
        title: analyze ? "Comparison analysis" : "Comparison bundle",
        payload,
      });
    } catch (compareError) {
      fail(compareError);
    } finally {
      setBusy("");
    }
  };

  return {
    ...navigation,
    busy,
    canGoBack: navigation.historyIndex > 0,
    canGoForward:
      navigation.historyIndex >= 0 &&
      navigation.historyIndex < navigation.history.length - 1,
    clearResult: () => setResult(null),
    compare,
    compareUrl,
    embedded,
    error,
    errorField,
    fail,
    navigate,
    previewSize,
    reloadPreview,
    result,
    resultStatusMessage,
    runAction,
    setPreviewSize,
    status,
    statusLabel,
    travelHistory,
    updateAddress,
    updateCompareUrl,
  };
}
