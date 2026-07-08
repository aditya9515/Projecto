import { ipcMain } from "electron";

import { SubscriptionService } from "../services/subscriptionService";

export function registerBillingIpc(
  subscriptionService: SubscriptionService,
): void {
  ipcMain.handle("billing:getSubscriptionState", async () => {
    return subscriptionService.getSubscriptionState();
  });

  ipcMain.handle("billing:openUpgradePage", async () => {
    await subscriptionService.openUpgradePage();
  });

  ipcMain.handle("billing:startGoogleSignIn", async () => {
    await subscriptionService.startGoogleSignIn();
  });

  ipcMain.handle("billing:refreshSubscription", async () => {
    return subscriptionService.refreshSubscription();
  });
}
