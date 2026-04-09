import type {
  ask,
  askSecret,
  askYesNo,
  chooseMany,
  chooseOne,
} from "../core/prompt-ops";
import type { PairingMode, TransportName, WizardAnswers } from "../types";

export interface ExecutionHandsSelectionResult {
  transports: TransportName[];
  pairingMode: PairingMode;
  allowAllUsers: boolean;
  telegramBotToken: string;
  discordBotToken: string;
  slackWebhookUrl: string;
  slackSigningSecret: string;
  homeAssistantUrl: string;
  homeAssistantToken: string;
  tools: WizardAnswers["tools"];
  mcpServerCommand: string;
  acpServerCommand: string;
  falApiKey: string;
  e2bApiKey: string;
  githubToken: string;
}

export interface ExecutionChannelsSelectionResult {
  transports: TransportName[];
  pairingMode: PairingMode;
  allowAllUsers: boolean;
  telegramBotToken: string;
  discordBotToken: string;
  slackWebhookUrl: string;
  slackSigningSecret: string;
  homeAssistantUrl: string;
  homeAssistantToken: string;
}

export interface ExecutionToolSelectionResult {
  tools: WizardAnswers["tools"];
  mcpServerCommand: string;
  acpServerCommand: string;
  falApiKey: string;
  e2bApiKey: string;
  githubToken: string;
}

export interface ExecutionHandsPromptDeps {
  chooseMany: typeof chooseMany;
  chooseOne: typeof chooseOne;
  ask: typeof ask;
  askSecret: typeof askSecret;
  askYesNo: typeof askYesNo;
}
