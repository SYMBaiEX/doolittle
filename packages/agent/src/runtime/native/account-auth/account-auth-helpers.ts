import type { LinkedProviderAccountStatus, LinkedProviderName } from "./types";

interface ProviderStatusBase {
  provider: LinkedProviderName;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  loginCommand: string;
  setupCommand?: string;
  detail: string;
}

interface ProviderStatusDecision extends ProviderStatusBase {
  available: boolean;
  reusable: boolean;
  nativeReady: boolean;
  fallbackReady: boolean;
}

export interface ProviderStatusBuilderInput
  extends Omit<
    ProviderStatusDecision,
    "available" | "reusable" | "nativeReady" | "fallbackReady"
  > {
  available?: boolean;
  reusable?: boolean;
  nativeReady?: boolean;
  fallbackReady?: boolean;
}

export function buildProviderStatus({
  provider,
  available = false,
  reusable = false,
  nativeReady = false,
  fallbackReady = false,
  source,
  authMode,
  lastRefresh,
  accountLabel,
  loginCommand,
  setupCommand,
  detail,
}: ProviderStatusBuilderInput): LinkedProviderAccountStatus {
  return {
    provider,
    available,
    reusable,
    nativeReady,
    fallbackReady,
    source,
    authMode,
    lastRefresh,
    accountLabel,
    loginCommand,
    setupCommand,
    detail,
  };
}

export function buildReusableProviderStatus(
  input: ProviderStatusBuilderInput,
): LinkedProviderAccountStatus {
  return buildProviderStatus({
    ...input,
    available: true,
    reusable: true,
    nativeReady: input.nativeReady ?? true,
    fallbackReady: input.fallbackReady ?? false,
  });
}

export function buildUnavailableProviderStatus(
  input: ProviderStatusBuilderInput,
): LinkedProviderAccountStatus {
  return buildProviderStatus({
    ...input,
    available: input.available ?? false,
    reusable: input.reusable ?? false,
    nativeReady: false,
    fallbackReady: input.fallbackReady ?? false,
  });
}
