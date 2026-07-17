import {
  getUpgradeReasonCopy,
  parseUpgradeReason,
} from "../../billing/upgradeGate";
import {
  parseProjectAlreadyRunning,
  parseProjectPortOwned,
} from "../../shared/launchErrors";

function unwrapElectronIpcMessage(message: string): string {
  const marker = ": Error: ";
  const markerIndex = message.lastIndexOf(marker);

  if (markerIndex === -1) {
    return message;
  }

  return message.slice(markerIndex + marker.length).trim();
}

export function getFriendlyErrorMessage(
  error: unknown,
  fallback = "Projecto could not complete that action.",
): string {
  const upgradeReason = parseUpgradeReason(error);
  if (upgradeReason) {
    return getUpgradeReasonCopy(upgradeReason).description;
  }

  const alreadyRunningProjectId = parseProjectAlreadyRunning(error);
  if (alreadyRunningProjectId) {
    return "Use Mapped Terminal or Stop before launching again.";
  }

  const portConflict = parseProjectPortOwned(error);
  if (portConflict) {
    return `Port ${portConflict.port} belongs to another Projecto launch. Stop that project first.`;
  }

  if (!(error instanceof Error) && typeof error !== "string") {
    return fallback;
  }

  const rawMessage = error instanceof Error ? error.message : error;
  const message = unwrapElectronIpcMessage(rawMessage).trim();

  if (!message) {
    return fallback;
  }

  if (message === "Not Found" || message.endsWith(": Not Found")) {
    return "Projecto could not find the requested account, project, or service record. Refresh and try again.";
  }

  if (message.includes("Failed to fetch") || message.includes("fetch failed")) {
    return "Projecto could not reach the backend. Check your network connection and retry.";
  }

  if (message.includes("No active project session was found to stop")) {
    return "Projecto could not find an active launch for this project. Refresh and try again.";
  }

  return message;
}