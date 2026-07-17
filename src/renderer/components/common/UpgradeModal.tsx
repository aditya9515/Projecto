import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, RefreshCw, ShieldCheck, X } from "lucide-react";
import { PLAN_COPY } from "../../../billing/pricing";
import {
  getUpgradeReasonCopy,
  needsReconnect,
  type UpgradeReason,
} from "../../../billing/upgradeGate";
import type { SubscriptionState } from "../../../main/types/shared";
import { AccountIdentity } from "./AccountIdentity";
import { Button } from "./Button";
import { PlanBadge } from "./PlanBadge";
type UpgradeModalProps = {
  open: boolean;
  reason: UpgradeReason | null;
  subscription: SubscriptionState;
  loading: boolean;
  onUpgrade: () => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
  onSignIn: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
};
export function UpgradeModal({
  open,
  reason,
  subscription,
  loading,
  onUpgrade,
  onRefresh,
  onSignIn,
  onOpenChange,
}: UpgradeModalProps): JSX.Element {
  const copy = getUpgradeReasonCopy(reason ?? "projects");
  const reconnect = needsReconnect(subscription);
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="app-overlay fixed inset-0 z-40 " />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4 outline-none">
                <motion.div
                  animate={{ scale: 1, y: 0 }}
                  className="app-popup-surface w-[min(760px,calc(100vw-2rem))] rounded-[30px] border border-line p-6"
                  exit={{ scale: 0.98, y: 10 }}
                  initial={{ scale: 0.96, y: 18 }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="app-icon-surface inline-flex h-12 w-12 items-center justify-center rounded-2xl text-text">
                        <Crown className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                          Projecto Plus
                        </div>
                        <Dialog.Title className="mt-2 text-3xl font-semibold tracking-tight text-text">
                          {copy.title}
                        </Dialog.Title>
                        <Dialog.Description className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                          {copy.description}
                        </Dialog.Description>
                      </div>
                    </div>
                    <Dialog.Close className="app-close-control rounded-2xl p-2 transition">
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>
                  <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <div className="app-soft-surface rounded-[28px] border border-line p-5">
                      <div className="text-sm font-semibold text-text">
                        Why Plus uses web billing
                      </div>
                      <div className="mt-4 space-y-3">
                        {copy.featureBullets.map((feature) => (
                          <div className="flex items-start gap-3" key={feature}>
                            <div className="mt-1 h-2 w-2 rounded-full bg-accent" />
                            <div className="text-sm text-muted">{feature}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 rounded-[24px] border border-line bg-shell p-4">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-text" />
                          <div className="text-sm font-semibold text-text">
                            Current desktop status
                          </div>
                        </div>
                        <PlanBadge
                          className="mt-3"
                          plan={subscription.plan}
                          status={subscription.status}
                        />
                        {subscription.email ? (
                          <div className="mt-3">
                            <AccountIdentity subscription={subscription} />
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-muted">
                            Sign in from the web to connect this desktop app to
                            your Projecto account.
                          </div>
                        )}
                        {subscription.entitlements?.requiresOnline ? (
                          <div className="mt-2 text-xs leading-5 text-muted">
                            Projecto needs an active online connection to verify
                            access and sync project directories.
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="app-soft-surface rounded-[28px] border border-line p-5">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                        {PLAN_COPY.pro.tagline}
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-text">
                        {PLAN_COPY.pro.name}
                      </div>
                      <div className="mt-2 text-sm text-muted">
                        {PLAN_COPY.pro.description}
                      </div>
                      <div className="mt-6 space-y-3">
                        {PLAN_COPY.pro.features.map((feature) => (
                          <div className="flex items-start gap-3" key={feature}>
                            <div className="mt-1 h-2 w-2 rounded-full bg-accent" />
                            <div className="text-sm text-text">{feature}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-8 space-y-3">
                        <Button
                          className="w-full justify-center"
                          onClick={() => void onUpgrade()}
                          variant="primary"
                        >
                          Pricing
                        </Button>
                        <div className="text-center text-xs text-muted">
                          Monthly and yearly plans continue on the Projecto
                          pricing page in your browser.
                        </div>
                        {reconnect ? (
                          <Button
                            className="w-full justify-center"
                            onClick={() => void onSignIn()}
                            variant="secondary"
                          >
                            Sign in with Projecto
                          </Button>
                        ) : null}
                        <Button
                          className="w-full justify-center"
                          onClick={() => void onRefresh()}
                          variant="ghost"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {loading ? "Refreshing..." : "Refresh subscription"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
