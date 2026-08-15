// @vitest-environment jsdom

import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DoolittleDesktopBridge,
  Project,
  WorkspaceState,
} from "../shared/contracts";
import type { View } from "./desktop-navigation";
import type { ProjectScope } from "./project-manager/models";
import {
  createWorkspaceTransitionCoordinator,
  runWorkspaceRequest,
  useWorkspaceProjectNavigation,
} from "./use-workspace-project-navigation";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let navigationRoot: Root;
let navigationContainer: HTMLDivElement;
let latestNavigation: ReturnType<typeof useWorkspaceProjectNavigation> | null =
  null;

const workspace = {
  currentPath: "/work/alpha",
  recentPaths: ["/work/alpha", "/work/bravo"],
} satisfies WorkspaceState;

const projects = [
  {
    id: "alpha",
    name: "Alpha",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    primaryPath: "/work/alpha",
    resources: [],
  },
] satisfies Project[];

function NavigationProbe({
  confirmViewChange = () => true,
  confirmWorkspaceChange,
  onCodeEditingLockChange,
  onRestoreCodeDirty,
  onStateChange,
  projectEntries = projects,
  setView,
}: {
  confirmViewChange?: (view: View) => boolean;
  confirmWorkspaceChange?: () => boolean;
  onCodeEditingLockChange?: (locked: boolean) => void;
  onRestoreCodeDirty?: () => void;
  onStateChange?: (state: {
    projectScope: string;
    selectedSession: string;
    workspace: WorkspaceState;
  }) => void;
  projectEntries?: readonly Project[];
  setView: (
    view: View,
    options?: { readonly skipDirtyCheck?: boolean },
  ) => boolean;
}) {
  const [projectScope, setProjectScope] = useState<ProjectScope>("alpha");
  const [selectedSession, setSelectedSession] = useState("code-session");
  const [currentWorkspace, setWorkspace] = useState(workspace);
  const value = useWorkspaceProjectNavigation({
    backendReady: true,
    createSessionId: () => "new-session",
    setCodeEditingLocked: onCodeEditingLockChange ?? (() => undefined),
    restoreCodeDirtyAfterFailedWorkspaceTransition:
      onRestoreCodeDirty ?? (() => undefined),
    pathsEqual: (left, right) => left === right,
    projects: projectEntries,
    projectScope,
    pushToast: vi.fn(),
    selectedSession,
    sessions: [],
    setProjectScope,
    setSelectedSession,
    confirmViewChange,
    confirmWorkspaceChange,
    setView,
    setWorkspace,
    workspace: currentWorkspace,
  });
  useEffect(() => {
    latestNavigation = value;
  }, [value]);
  useEffect(() => {
    onStateChange?.({
      projectScope,
      selectedSession,
      workspace: currentWorkspace,
    });
  }, [currentWorkspace, onStateChange, projectScope, selectedSession]);
  return null;
}

beforeEach(() => {
  navigationContainer = document.createElement("div");
  document.body.append(navigationContainer);
  navigationRoot = createRoot(navigationContainer);
  latestNavigation = null;
});

afterEach(() => {
  vi.useRealTimers();
  act(() => navigationRoot.unmount());
  navigationContainer.remove();
  latestNavigation = null;
});

async function renderNavigationProbe({
  confirmViewChange,
  confirmWorkspaceChange,
  onCodeEditingLockChange,
  onRestoreCodeDirty,
  onStateChange,
  projectEntries,
  setView,
}: {
  confirmViewChange?: (view: View) => boolean;
  confirmWorkspaceChange?: () => boolean;
  onCodeEditingLockChange?: (locked: boolean) => void;
  onRestoreCodeDirty?: () => void;
  onStateChange?: (state: {
    projectScope: string;
    selectedSession: string;
    workspace: WorkspaceState;
  }) => void;
  projectEntries?: readonly Project[];
  setView: (
    view: View,
    options?: { readonly skipDirtyCheck?: boolean },
  ) => boolean;
}) {
  await act(async () => {
    navigationRoot.render(
      createElement(NavigationProbe, {
        confirmViewChange,
        confirmWorkspaceChange,
        onCodeEditingLockChange,
        onRestoreCodeDirty,
        onStateChange,
        projectEntries,
        setView,
      }),
    );
  });
  if (!latestNavigation) throw new Error("Navigation probe did not mount.");
  return latestNavigation;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("workspace transition coordinator", () => {
  it("ignores stale async workspace results and balances request counters", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const committed: string[] = [];

    const firstRequest = runWorkspaceRequest({
      coordinator,
      operation: () => first.promise,
      onCurrent: (result) => committed.push(result),
    });
    expect(coordinator.snapshot()).toEqual({
      current: 1,
      inFlight: 1,
      pendingScope: null,
    });

    const secondRequest = runWorkspaceRequest({
      coordinator,
      operation: () => second.promise,
      onCurrent: (result) => committed.push(result),
    });
    expect(coordinator.snapshot()).toEqual({
      current: 2,
      inFlight: 2,
      pendingScope: null,
    });

    second.resolve("second");
    await expect(secondRequest).resolves.toMatchObject({
      current: true,
      result: "second",
      transition: 2,
    });
    expect(committed).toEqual(["second"]);
    expect(coordinator.snapshot().inFlight).toBe(1);

    first.resolve("first");
    await expect(firstRequest).resolves.toMatchObject({
      current: false,
      result: "first",
      transition: 1,
    });
    expect(committed).toEqual(["second"]);
    expect(coordinator.snapshot().inFlight).toBe(0);
  });

  it("shares a parent project transition without advancing its generation", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const transition = coordinator.begin("project-a");
    const operation = vi.fn(async () => "workspace-a");
    const onCurrent = vi.fn();

    await expect(
      runWorkspaceRequest({
        coordinator,
        operation,
        onCurrent,
        transition,
      }),
    ).resolves.toMatchObject({ current: true, transition });

    expect(coordinator.snapshot()).toEqual({
      current: transition,
      inFlight: 0,
      pendingScope: "project-a",
    });
    expect(onCurrent).toHaveBeenCalledWith("workspace-a");

    coordinator.clearPending(transition);
    expect(coordinator.snapshot().pendingScope).toBeNull();
  });

  it("balances the in-flight counter when a native request rejects", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const failure = new Error("picker failed");

    await expect(
      runWorkspaceRequest({
        coordinator,
        operation: async () => {
          throw failure;
        },
        onCurrent: vi.fn(),
      }),
    ).rejects.toBe(failure);

    expect(coordinator.snapshot()).toEqual({
      current: 1,
      inFlight: 0,
      pendingScope: null,
    });
  });
});

describe("project scope transition", () => {
  it("does not activate a chat handoff when leaving Code is declined", async () => {
    const setView = vi.fn(() => false);
    const onActivated = vi.fn(() => true);
    const navigation = await renderNavigationProbe({ setView });

    await expect(
      navigation.transitionToProjectScope(
        "alpha",
        "chat-session",
        "chat",
        onActivated,
      ),
    ).resolves.toBe(false);

    expect(setView).toHaveBeenCalledWith("chat");
    expect(onActivated).not.toHaveBeenCalled();
  });

  it("does not switch workspaces or arm a handoff when the cross-workspace leave is declined", async () => {
    const switchWorkspace = vi.fn();
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "switchWorkspace"
      >,
    });
    const confirmViewChange = vi.fn(() => false);
    const setView = vi.fn(() => true);
    const onActivated = vi.fn(() => true);
    const states: Array<{
      projectScope: string;
      selectedSession: string;
      workspace: WorkspaceState;
    }> = [];
    const navigation = await renderNavigationProbe({
      confirmViewChange,
      onStateChange: (state) => states.push(state),
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView,
    });

    await expect(
      navigation.transitionToProjectScope(
        "bravo",
        "chat-session",
        "chat",
        onActivated,
      ),
    ).resolves.toBe(false);

    expect(confirmViewChange).toHaveBeenCalledOnce();
    expect(switchWorkspace).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
    expect(onActivated).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      projectScope: "alpha",
      selectedSession: "code-session",
      workspace,
    });
  });

  it("preflights a cross-workspace leave once before switching and completing the handoff", async () => {
    vi.useFakeTimers();
    const bravoWorkspace = {
      currentPath: "/work/bravo",
      recentPaths: ["/work/alpha", "/work/bravo"],
    } satisfies WorkspaceState;
    const switchWorkspace = vi.fn(async () => ({
      canceled: false,
      state: bravoWorkspace,
    }));
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "switchWorkspace"
      >,
    });
    const confirmViewChange = vi.fn(() => true);
    const confirmWorkspaceChange = vi.fn(() => false);
    const setView = vi.fn(() => true);
    const onActivated = vi.fn(() => true);
    const states: Array<{
      projectScope: string;
      selectedSession: string;
      workspace: WorkspaceState;
    }> = [];
    const navigation = await renderNavigationProbe({
      confirmViewChange,
      confirmWorkspaceChange,
      onStateChange: (state) => states.push(state),
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView,
    });

    const transition = navigation.transitionToProjectScope(
      "bravo",
      "chat-session",
      "chat",
      onActivated,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    await expect(transition).resolves.toBe(true);
    expect(confirmViewChange).toHaveBeenCalledTimes(1);
    expect(confirmWorkspaceChange).not.toHaveBeenCalled();
    expect(switchWorkspace).toHaveBeenCalledOnce();
    expect(switchWorkspace).toHaveBeenCalledWith("/work/bravo");
    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenCalledWith("chat", { skipDirtyCheck: true });
    expect(onActivated).toHaveBeenCalledOnce();
    expect(states.at(-1)).toMatchObject({
      projectScope: "bravo",
      selectedSession: "chat-session",
      workspace: bravoWorkspace,
    });
  });

  it("lets a newer declined transition cancel an older approved workspace switch", async () => {
    vi.useFakeTimers();
    const switchWorkspace = vi.fn();
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "switchWorkspace"
      >,
    });
    const confirmViewChange = vi
      .fn<(_: View) => boolean>()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const lockChanges: boolean[] = [];
    const restoreCodeDirty = vi.fn();
    const navigation = await renderNavigationProbe({
      confirmViewChange,
      onCodeEditingLockChange: (locked) => lockChanges.push(locked),
      onRestoreCodeDirty: restoreCodeDirty,
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView: vi.fn(() => true),
    });

    const first = navigation.transitionToProjectScope(
      "bravo",
      "first-session",
      "chat",
    );
    await expect(
      navigation.transitionToProjectScope("bravo", "second-session", "chat"),
    ).resolves.toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    await expect(first).resolves.toBe(false);
    expect(switchWorkspace).not.toHaveBeenCalled();
    expect(lockChanges).toEqual([false, true, false]);
    expect(restoreCodeDirty).toHaveBeenCalledOnce();
  });

  it("unlocks Code and preserves scope when the approved workspace switch fails", async () => {
    vi.useFakeTimers();
    const failure = new Error("switch failed");
    const switchWorkspace = vi.fn(async () => {
      throw failure;
    });
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "switchWorkspace"
      >,
    });
    const lockChanges: boolean[] = [];
    const restoreCodeDirty = vi.fn();
    const states: Array<{
      projectScope: string;
      selectedSession: string;
      workspace: WorkspaceState;
    }> = [];
    const setView = vi.fn(() => true);
    const navigation = await renderNavigationProbe({
      confirmViewChange: () => true,
      onCodeEditingLockChange: (locked) => lockChanges.push(locked),
      onRestoreCodeDirty: restoreCodeDirty,
      onStateChange: (state) => states.push(state),
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView,
    });

    const transition = navigation.transitionToProjectScope(
      "bravo",
      "chat-session",
      "chat",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    await expect(transition).resolves.toBe(false);
    expect(lockChanges).toEqual([false, true, false]);
    expect(restoreCodeDirty).toHaveBeenCalledOnce();
    expect(setView).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      projectScope: "alpha",
      selectedSession: "code-session",
      workspace,
    });
  });

  it("keeps an active native workspace switch single-flight", async () => {
    vi.useFakeTimers();
    const nativeSwitch = deferred<{ canceled: false; state: WorkspaceState }>();
    const bravoWorkspace = {
      currentPath: "/work/bravo",
      recentPaths: ["/work/alpha", "/work/bravo"],
    } satisfies WorkspaceState;
    const switchWorkspace = vi.fn(() => nativeSwitch.promise);
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "switchWorkspace"
      >,
    });
    const lockChanges: boolean[] = [];
    const states: Array<{
      projectScope: string;
      selectedSession: string;
      workspace: WorkspaceState;
    }> = [];
    const navigation = await renderNavigationProbe({
      confirmViewChange: () => true,
      onCodeEditingLockChange: (locked) => lockChanges.push(locked),
      onStateChange: (state) => states.push(state),
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView: vi.fn(() => true),
    });

    const first = navigation.transitionToProjectScope(
      "bravo",
      "first-session",
      "chat",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    navigation.handleWorkspaceState({
      currentPath: "/work/native-event",
      recentPaths: ["/work/native-event"],
    });

    await expect(
      navigation.transitionToProjectScope("bravo", "second-session", "chat"),
    ).resolves.toBe(false);
    expect(switchWorkspace).toHaveBeenCalledOnce();
    expect(lockChanges).toEqual([false, true]);
    expect(states.at(-1)?.workspace).toEqual(workspace);

    await act(async () => {
      nativeSwitch.resolve({ canceled: false, state: bravoWorkspace });
      await expect(first).resolves.toBe(true);
    });
    expect(lockChanges).toEqual([false, true, false]);
    expect(states.at(-1)).toMatchObject({
      projectScope: "bravo",
      selectedSession: "first-session",
      workspace: bravoWorkspace,
    });
  });

  it("blocks direct workspace mutations while a debounced project switch owns the Code lock", async () => {
    vi.useFakeTimers();
    const bravoWorkspace = {
      currentPath: "/work/bravo",
      recentPaths: ["/work/alpha", "/work/bravo"],
    } satisfies WorkspaceState;
    const pickWorkspace = vi.fn(async () => ({
      canceled: false,
      state: {
        currentPath: "/work/picked",
        recentPaths: ["/work/picked"],
      },
    }));
    const openWorkspace = vi.fn(async () => ({
      canceled: false,
      state: {
        currentPath: "/work/opened",
        recentPaths: ["/work/opened"],
      },
    }));
    const switchWorkspace = vi.fn(async () => ({
      canceled: false,
      state: bravoWorkspace,
    }));
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { openWorkspace, pickWorkspace, switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "openWorkspace" | "pickWorkspace" | "switchWorkspace"
      >,
    });
    const lockChanges: boolean[] = [];
    const navigation = await renderNavigationProbe({
      confirmViewChange: () => true,
      onCodeEditingLockChange: (locked) => lockChanges.push(locked),
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView: vi.fn(() => true),
    });

    const transition = navigation.transitionToProjectScope(
      "bravo",
      "chat-session",
      "chat",
    );
    expect(lockChanges).toEqual([false, true]);

    await expect(navigation.chooseWorkspace()).resolves.toEqual({
      canceled: true,
      state: workspace,
    });
    await expect(navigation.openWorkspacePath("/work/opened")).resolves.toEqual(
      { canceled: true, state: workspace },
    );
    await expect(
      navigation.switchToRecentWorkspace("/work/opened"),
    ).resolves.toBe(false);
    expect(pickWorkspace).not.toHaveBeenCalled();
    expect(openWorkspace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    await expect(transition).resolves.toBe(true);
    expect(switchWorkspace).toHaveBeenCalledOnce();
    expect(lockChanges).toEqual([false, true, false]);
  });

  it("preflights and locks a cross-workspace project selection without changing views", async () => {
    vi.useFakeTimers();
    const switchWorkspace = vi.fn(async () => ({
      canceled: false,
      state: {
        currentPath: "/work/bravo",
        recentPaths: ["/work/alpha", "/work/bravo"],
      },
    }));
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { switchWorkspace } as Pick<
        DoolittleDesktopBridge,
        "switchWorkspace"
      >,
    });
    const confirmWorkspaceChange = vi.fn(() => true);
    const confirmViewChange = vi.fn(() => true);
    const lockChanges: boolean[] = [];
    const setView = vi.fn(() => true);
    const navigation = await renderNavigationProbe({
      confirmViewChange,
      confirmWorkspaceChange,
      onCodeEditingLockChange: (locked) => lockChanges.push(locked),
      projectEntries: [
        ...projects,
        { ...projects[0], id: "bravo", primaryPath: "/work/bravo" },
      ],
      setView,
    });

    const transition = navigation.transitionToProjectScope(
      "bravo",
      "chat-session",
    );
    expect(confirmWorkspaceChange).toHaveBeenCalledOnce();
    expect(lockChanges).toEqual([false, true]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    await expect(transition).resolves.toBe(true);
    expect(confirmViewChange).not.toHaveBeenCalled();
    expect(confirmWorkspaceChange).toHaveBeenCalledOnce();
    expect(switchWorkspace).toHaveBeenCalledOnce();
    expect(setView).not.toHaveBeenCalled();
    expect(lockChanges).toEqual([false, true, false]);
  });
});
