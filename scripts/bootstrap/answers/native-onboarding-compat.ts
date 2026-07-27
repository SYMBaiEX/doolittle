export type NativeOnboardingMachine = {
  advanceStep: (input: { step: string; data: unknown }) => Promise<unknown>;
  getContext: () => unknown;
  getCurrentStep: () => string;
  toJSON: () => unknown;
};

export type NativeOnboardingHelpers = {
  createOnboardingStateMachine: (input: {
    platform: string;
    mode: string;
  }) => NativeOnboardingMachine;
  getOnboardingSummary: (context: unknown) => string;
  isOnboardingComplete: (context: unknown) => boolean;
  OnboardingStep: {
    WELCOME: string;
    RISK_ACK: string;
    AUTH: string;
    CHANNELS: string;
    SKILLS: string;
  };
};

export const NativeOnboardingStep: NativeOnboardingHelpers["OnboardingStep"] = {
  WELCOME: "WELCOME",
  RISK_ACK: "RISK_ACK",
  AUTH: "AUTH",
  CHANNELS: "CHANNELS",
  SKILLS: "SKILLS",
};

const UNAVAILABLE_MESSAGE =
  "@elizaos/core no longer exports the onboarding state machine in 2.0.3-beta.7";

export const defaultNativeOnboardingHelpers: NativeOnboardingHelpers = {
  createOnboardingStateMachine: () => {
    throw new Error(UNAVAILABLE_MESSAGE);
  },
  getOnboardingSummary: () => "Native onboarding mirror unavailable.",
  isOnboardingComplete: () => false,
  OnboardingStep: NativeOnboardingStep,
};
