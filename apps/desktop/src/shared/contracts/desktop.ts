export type DesktopCommand =
  | "new-chat"
  | "command-palette"
  | "settings"
  | "toggle-sidebar"
  | "toggle-terminal"
  | "toggle-inspector";
export interface FileSelection {
  canceled: boolean;
  paths: string[];
}
export interface ProjectResourceSelection extends FileSelection {
  kind: "file" | "folder";
}
export type ManagedAttachmentKind = "audio" | "document" | "image" | "video";
export interface ManagedAttachmentDescriptor {
  id: string;
  name: string;
  kind: ManagedAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}
export interface AttachmentSelection {
  canceled: boolean;
  attachments: ManagedAttachmentDescriptor[];
}
export type SupportedRecordedAudioMime =
  | "audio/mp4"
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/wav"
  | "audio/webm";
export interface RecordedAudioImportRequest {
  bytes: Uint8Array;
  mimeType: SupportedRecordedAudioMime;
  name: string;
}
export interface WorkspaceState {
  currentPath: string;
  recentPaths: string[];
}
export interface DesktopLifecycleState {
  keepRunningInBackground: boolean;
}
export type DesktopUpdatePhase =
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "current"
  | "error";
export interface DesktopUpdateState {
  phase: DesktopUpdatePhase;
  message: string;
  version?: string;
  progress?: number;
}
export interface WorkspacePickResult {
  canceled: boolean;
  state: WorkspaceState;
}
export interface DesktopCommandRequest {
  command: string;
  timeoutMs?: number;
}
export type DesktopCommandResult =
  | { status: "cancelled" }
  | { status: "completed"; result: unknown };
