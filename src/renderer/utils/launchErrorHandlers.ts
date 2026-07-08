import {
  parseProjectAlreadyRunning,
  parseProjectPortOwned,
} from "../../shared/launchErrors";
import type { ToastItem } from "../store/useToastStore";

type PushToast = (toast: Omit<ToastItem, "id">) => void;

export async function handleMappedLaunchError(
  error: unknown,
  pushToast: PushToast,
): Promise<boolean> {
  const alreadyRunningProjectId = parseProjectAlreadyRunning(error);

  if (alreadyRunningProjectId) {
    pushToast({
      title: "Project already running",
      description: `Project ${alreadyRunningProjectId} already has an active background process. Use Stop before launching it again.`,
      tone: "info",
    });
    return true;
  }

  const portConflict = parseProjectPortOwned(error);

  if (portConflict) {
    pushToast({
      title: `Port ${portConflict.port} is already mapped`,
      description: `Another Projecto project owns this port right now (${portConflict.projectId}). Stop or reveal that terminal before launching a second project on the same port.`,
      tone: "error",
    });
    return true;
  }

  return false;
}
