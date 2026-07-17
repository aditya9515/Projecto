import type { BillingCycle, SubscriptionPlan } from "../main/types/shared";

export type PricingFeatureRow = {
  label: string;
  free: string;
  pro: string;
};

export type PricingTier = {
  id: SubscriptionPlan;
  name: string;
  tagline: string;
  description: string;
  ctaLabel: string;
  highlight?: string;
  features: string[];
};

export const FREE_LIMITS = {
  projects: 5,
} as const;

export const PLAN_COPY: Record<SubscriptionPlan, PricingTier> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For focused local work",
    description:
      "Core project launch tools for up to five synced project directories.",
    ctaLabel: "Current plan",
    features: [
      "Up to 5 project directories",
      "Basic project detection",
      "1 active project launch at a time",
      "Bulk import locked",
    ],
  },
  pro: {
    id: "pro",
    name: "Plus",
    tagline: "For serious builders",
    description:
      "Unlimited synced workspace control with advanced detection, bulk import, and every new Plus update.",
    ctaLabel: "Pricing",
    highlight: "Most popular",
    features: [
      "Unlimited project directories",
      "Unlimited active project launches",
      "Advanced project detection",
      "Smart bulk import and bulk scan",
      "All new Plus updates",
    ],
  },
};

export const PRICING_MATRIX: PricingFeatureRow[] = [
  { label: "Project directories", free: "Up to 5", pro: "Unlimited" },
  { label: "Concurrent launches", free: "1 at a time", pro: "Unlimited" },
  { label: "Change directories", free: "Included", pro: "Included" },
  { label: "Bulk import", free: "Locked", pro: "Included" },
  { label: "Bulk scan", free: "Locked", pro: "Included" },
  { label: "New Plus updates", free: "Basic only", pro: "Included" },
];

export const BILLING_DISPLAY: Record<
  BillingCycle,
  {
    cycle: BillingCycle;
    priceLabel: string;
    cadenceLabel: string;
    helper: string;
    savingsLabel?: string;
  }
> = {
  monthly: {
    cycle: "monthly" as BillingCycle,
    priceLabel: "$8",
    cadenceLabel: "/month",
    helper: "Secure web checkout",
  },
  yearly: {
    cycle: "yearly" as BillingCycle,
    priceLabel: "$80",
    cadenceLabel: "/year",
    helper: "2 months free with annual billing on the web",
    savingsLabel: "2 months free",
  },
};
