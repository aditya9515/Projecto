import type { SubscriptionState } from "../../main/types/shared";
function normalizeNamePart(part: string): string {
  return part
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
}
export function getAccountDisplayName(subscription: SubscriptionState): string {
  const trimmedName = subscription.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }
  if (subscription.email) {
    const [localPart] = subscription.email.split("@");
    return localPart || "Projecto User";
  }
  return "Projecto User";
}
export function getAccountInitials(subscription: SubscriptionState): string {
  const trimmedName = subscription.name?.trim();
  if (trimmedName) {
    return normalizeNamePart(trimmedName).slice(0, 2) || "P";
  }
  if (subscription.email) {
    return subscription.email.slice(0, 1).toUpperCase();
  }
  return "P";
}
