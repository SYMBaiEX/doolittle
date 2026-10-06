import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@elizaos/ui/dropdown-menu";
import {
  cloneElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export interface ContextAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
}

export interface ContextActionMenuProps {
  label: string;
  items: readonly ContextAction[];
  children: ReactNode;
  /** A dedicated overflow button: do not reuse a primary-action button. */
  trigger?: ReactElement;
  scopeKey?: string;
  disabled?: boolean;
  /** Defaults to display:contents so existing row/tab geometry is unchanged. */
  className?: string;
}

interface MenuAnchor {
  x: number;
  y: number;
  invoker: HTMLElement | null;
}

const NATIVE_CONTEXT_SELECTOR =
  "input,textarea,select,[contenteditable]:not([contenteditable=false]),a[href],.monaco-editor,.xterm,iframe,webview,[data-native-context-menu]";
const FOCUSABLE_SELECTOR =
  "button:not(:disabled),summary,a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]";

/**
 * One action list for pointer, keyboard and visible overflow access.
 * Runtime effects remain owned by the caller; this composition only presents
 * official SDK menu primitives and never intercepts native editing surfaces.
 */
export function ContextActionMenu({
  label,
  items,
  children,
  trigger,
  scopeKey,
  disabled = false,
  className = "contents",
}: ContextActionMenuProps) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(true);
  const latestRef = useRef({ items, disabled, scopeKey });
  latestRef.current = { items, disabled, scopeKey };
  const contentId = useId();
  const openScopeRef = useRef(scopeKey);
  const invokerRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(Boolean(anchor));
  openRef.current = Boolean(anchor);
  const enabled = !disabled && items.length > 0;

  useEffect(() => {
    if (!enabled || openScopeRef.current !== scopeKey) setAnchor(null);
  }, [enabled, scopeKey]);

  useEffect(() => {
    if (!anchor) return;
    const wrapper = wrapperRef.current;
    const document = wrapper?.ownerDocument;
    if (!wrapper || !document) return;
    const Observer = document.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer(() => {
      if (
        !wrapper.isConnected ||
        (anchor.invoker && !anchor.invoker.isConnected)
      ) {
        restoreFocusRef.current = false;
        setAnchor(null);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchor]);

  function preserveNativeContext(target: EventTarget | null) {
    if (!(target instanceof Element)) return true;
    return Boolean(
      target.closest(NATIVE_CONTEXT_SELECTOR) ||
        target.ownerDocument.getSelection()?.toString(),
    );
  }

  function invokingElement(target: HTMLElement) {
    const wrapper = wrapperRef.current;
    const nearest = target.closest<HTMLElement>(FOCUSABLE_SELECTOR);
    if (nearest && wrapper?.contains(nearest)) return nearest;
    const active = target.ownerDocument.activeElement;
    if (active instanceof HTMLElement && wrapper?.contains(active))
      return active;
    return wrapper?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? null;
  }

  function show(x: number, y: number, invoker: HTMLElement | null) {
    if (!enabled) return;
    openScopeRef.current = scopeKey;
    restoreFocusRef.current = true;
    invokerRef.current = invoker;
    setAnchor({ x, y, invoker });
  }

  function onContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      !enabled ||
      preserveNativeContext(event.target)
    ) {
      return;
    }
    event.preventDefault();
    const target = event.target as HTMLElement;
    show(event.clientX, event.clientY, invokingElement(target));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      !enabled ||
      !(
        event.key === "ContextMenu" ||
        (event.key === "F10" && event.shiftKey)
      ) ||
      preserveNativeContext(event.target)
    ) {
      return;
    }
    event.preventDefault();
    const target = event.target as HTMLElement;
    const bounds = target.getBoundingClientRect();
    show(bounds.left, bounds.bottom, invokingElement(target));
  }

  const overflowTrigger = trigger
    ? cloneElement(
        trigger as ReactElement<{
          onClick?: (event: MouseEvent<HTMLElement>) => void;
          "aria-label"?: string;
          "aria-haspopup"?: "menu";
          "aria-expanded"?: boolean;
          "aria-controls"?: string;
          disabled?: boolean;
        }>,
        {
          "aria-label":
            (trigger.props as { "aria-label"?: string })["aria-label"] ?? label,
          "aria-haspopup": "menu",
          "aria-expanded": Boolean(anchor),
          "aria-controls": anchor ? contentId : undefined,
          disabled:
            !enabled || (trigger.props as { disabled?: boolean }).disabled,
          onClick: (event) => {
            (
              trigger.props as {
                onClick?: (event: MouseEvent<HTMLElement>) => void;
              }
            ).onClick?.(event);
            if (event.defaultPrevented || !enabled) return;
            if (anchor) {
              setAnchor(null);
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            show(bounds.left, bounds.bottom, event.currentTarget);
          },
        },
      )
    : null;

  return (
    <DropdownMenu
      modal={false}
      open={Boolean(anchor)}
      onOpenChange={(next) => {
        if (!next) setAnchor(null);
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Delegates context access from existing child controls without adding a competing role or tab stop. */}
      <div
        className={className}
        data-context-action-menu=""
        data-doolittle-context-menu={enabled ? "custom" : undefined}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        ref={wrapperRef}
      >
        {children}
        {overflowTrigger}
      </div>
      <DropdownMenuPortal forceMount>
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden="true"
            className="dl-action-menu-anchor"
            disabled={!enabled}
            style={{ left: anchor?.x ?? 0, top: anchor?.y ?? 0 }}
            tabIndex={-1}
            type="button"
          />
        </DropdownMenuTrigger>
      </DropdownMenuPortal>
      <DropdownMenuContent
        align="start"
        aria-label={label}
        aria-labelledby={undefined}
        avoidCollisions
        className="dl-action-menu"
        collisionPadding={12}
        id={contentId}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Radix schedules unmount autofocus. A rapid reopen must not let an
          // older popup steal focus from the newly mounted menu and dismiss it.
          if (openRef.current) return;
          const invoker = invokerRef.current;
          const active = invoker?.ownerDocument.activeElement;
          if (
            active &&
            active !== invoker?.ownerDocument.body &&
            active !== invoker
          ) {
            // Actions may intentionally focus a newly mounted editor or
            // confirmation. Its focus wins over delayed popup restoration.
            return;
          }
          if (restoreFocusRef.current && invoker?.isConnected) {
            invoker.focus({ preventScroll: true });
          }
        }}
        onInteractOutside={() => {
          restoreFocusRef.current = false;
        }}
        sideOffset={0}
      >
        {items.map((item) => (
          <div className="contents" key={item.id}>
            {item.separatorBefore ? (
              <DropdownMenuSeparator className="dl-action-menu-separator" />
            ) : null}
            <DropdownMenuItem
              className="dl-action-menu-item"
              data-destructive={item.destructive || undefined}
              disabled={item.disabled}
              onSelect={(event) => {
                const latest = latestRef.current;
                const action = latest.items.find(
                  (entry) => entry.id === item.id,
                );
                if (
                  latest.disabled ||
                  latest.scopeKey !== openScopeRef.current ||
                  !action ||
                  action.disabled
                ) {
                  event.preventDefault();
                  setAnchor(null);
                  return;
                }
                action.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut ? (
                <DropdownMenuShortcut className="dl-action-menu-shortcut">
                  {item.shortcut}
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
