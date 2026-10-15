import { handleTrusted } from "./trustedSender";


import { SubscriptionService } from "../services/subscriptionService";

export function registerBillingIpc(
  subscriptionService: SubscriptionService,
): void {
  handleTrusted("billing:getSubscriptionState", async () => {
    return subscriptionService.getSubscriptionState();
  });

  handleTrusted("billing:openUpgradePage", async () => {
    await subscriptionService.openUpgradePage();
  });

  handleTrusted("billing:startGoogleSignIn", async () => {
    await subscriptionService.startGoogleSignIn();
  });

  handleTrusted("billing:refreshSubscription", async () => {
    return subscriptionService.refreshSubscription();
  });
}
