import { create } from "zustand";
import type {
  BillingEvent,
  DesktopBridgeState,
  ProjectTerminalSession,
  RunEvent,
} from "../../main/types/shared";
const defaultBridgeState: DesktopBridgeState = {
  status: "starting",
  host: "127.0.0.1",
  protocolVersion: "unknown",
  extensionConnected: false,
  registeredWorkspaceCount: 0,
};
type AppStatusState = {
  online: boolean;
  bridgeState: DesktopBridgeState;
  lastSyncedAt?: string;
  latestSyncError?: string;
  latestBillingEvent: BillingEvent | null;
  latestBillingError?: string;
  recentLaunchFailures: RunEvent[];
  terminalSessions: Record<string, ProjectTerminalSession>;
  setOnline: (online: boolean) => void;
  setBridgeState: (bridgeState: DesktopBridgeState) => void;
  setTerminalSessions: (sessions: ProjectTerminalSession[]) => void;
  upsertTerminalSession: (session: ProjectTerminalSession) => void;
  markSynced: () => void;
  setSyncError: (message?: string) => void;
  setBillingEvent: (event: BillingEvent) => void;
  pushLaunchFailure: (event: RunEvent) => void;
  clearLaunchFailures: () => void;
};
export const useAppStatusStore = create<AppStatusState>((set) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  bridgeState: defaultBridgeState,
  latestBillingEvent: null,
  recentLaunchFailures: [],
  terminalSessions: {},
  setOnline: (online) => set({ online }),
  setBridgeState: (bridgeState) => set({ bridgeState }),
  setTerminalSessions: (sessions) =>
    set({
      terminalSessions: Object.fromEntries(
        sessions
          .filter((session) => session.status !== "stopped")
          .map((session) => [session.projectId, session]),
      ),
    }),
  upsertTerminalSession: (session) =>
    set((state) => {
      const next = { ...state.terminalSessions };
      if (session.status === "stopped") {
        delete next[session.projectId];
      } else {
        next[session.projectId] = session;
      }
      return { terminalSessions: next };
    }),
  markSynced: () =>
    set({ lastSyncedAt: new Date().toISOString(), latestSyncError: undefined }),
  setSyncError: (message) => set({ latestSyncError: message }),
  setBillingEvent: (event) =>
    set({
      latestBillingEvent: event,
      latestBillingError:
        event.type === "auth-failed" ||
        event.type === "subscription-refresh-failed"
          ? (event.message ?? "Subscription sync needs attention.")
          : undefined,
    }),
  pushLaunchFailure: (event) =>
    set((state) => ({
      recentLaunchFailures: [
        event,
        ...state.recentLaunchFailures.filter(
          (entry) => entry.runId !== event.runId,
        ),
      ].slice(0, 8),
    })),
  clearLaunchFailures: () => set({ recentLaunchFailures: [] }),
}));
