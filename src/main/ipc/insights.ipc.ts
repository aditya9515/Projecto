import { handleTrusted } from "./trustedSender";


import { ActivityStore } from "../services/activityStore";
import { ProjectStore } from "../services/projectStore";

type RegisterInsightsIpcOptions = {
  activityStore: ActivityStore;
  projectStore: ProjectStore;
};

export function registerInsightsIpc({
  activityStore,
  projectStore,
}: RegisterInsightsIpcOptions): void {
  handleTrusted("insights:getUsageStats", async () => {
    try {
      const projects = await projectStore.getProjects({
        persistLocalDetails: false,
        syncSubscription: false,
      });
      return await activityStore.getUsageStats(projects);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Projecto could not read local usage stats: ${error.message}`
          : "Projecto could not read local usage stats. Please retry.",
      );
    }
  });
}
