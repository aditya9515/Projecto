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
      title: "Project is running",
      description: "Use Stop or Mapped Terminal before launching again.",
      tone: "info",
    });
    return true;
  }

  const portConflict = parseProjectPortOwned(error);

  if (portConflict) {
    pushToast({
      title: `Port ${portConflict.port} is in use`,
      description:
        "Another Projecto launch owns this port. Stop it or choose a different port.",
      tone: "error",
    });
    return true;
  }

  return false;
}