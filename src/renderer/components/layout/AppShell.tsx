import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSubscriptionStore } from "../../store/useSubscriptionStore";
import { useUiStore } from "../../store/useUiStore";
import { LogsPanel } from "../common/LogsPanel";
import { Button } from "../common/Button";
import { PlanBadge } from "../common/PlanBadge";
import { SubscriptionBanner } from "../common/SubscriptionBanner";
import { UpdateOverlay } from "../common/UpdateOverlay";
import { AnimatedSidebar } from "./AnimatedSidebar";
import { MaskReveal } from "../motion/MaskReveal";
const pageTitles: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Dashboard",
    description:
      "Your recent projects, favorites, and ready-to-run workspace launches.",
  },
  "/import": {
    title: "Import Project",
    description:
      "Add a local folder, review detection, and save a launch-ready project.",
  },
  "/projects": {
    title: "Projects",
    description: "Browse every project connected to this desktop workspace.",
  },

  "/health": {
    title: "Health",
    description:
      "Check desktop, sync, account, terminal, and launch diagnostics.",
  },
  "/settings": {
    title: "Settings",
    description:
      "Account, plan, editors, launches, terminals, and desktop preferences.",
  },
};
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const subscription = useSubscriptionStore((state) => state.subscription);
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen,
  );
  const defaultPage = {
    title: "Dashboard",
    description: "Recent projects, favorites, and one-click launch actions.",
  };
  const page = location.pathname.startsWith("/projects/")
    ? {
        title: "Project Detail",
        description:
          "Launch profiles, commands, notes, and project-specific controls.",
      }
    : (pageTitles[location.pathname] ?? defaultPage);
  return (
    <div className="h-screen w-full overflow-hidden bg-bg text-text">
      {" "}
      <div className="app-shell-frame app-shell-surface relative flex h-full min-h-0 overflow-hidden border border-line">
        {" "}
        <AnimatedSidebar />{" "}
        <div className="flex min-w-0 flex-1 flex-col">
          {" "}
          <header className="app-topbar projecto-topbar border-b border-line px-5 py-5 lg:px-10 lg:py-6">
            {" "}
            <div className="projecto-topbar-inner mx-auto flex w-full max-w-[1560px] items-end justify-between gap-4">
              {" "}
              <div className="min-w-0">
                {" "}
                <div className="projecto-micro-label text-muted">
                  Projecto / {page.title}
                </div>{" "}
                <MaskReveal>
                  <h1 className="app-page-title mt-2 text-text">
                    {page.title}
                  </h1>
                </MaskReveal>{" "}
                <p className="mt-2 text-sm leading-6 text-muted">
                  {page.description}
                </p>{" "}
              </div>{" "}
              <div className="projecto-topbar-actions flex items-center gap-3">
                {" "}
                <PlanBadge
                  plan={subscription.plan}
                  status={subscription.status}
                />{" "}
                <Button
                  onClick={() => setCommandPaletteOpen(true)}
                  variant="secondary"
                >
                  {" "}
                  <Search className="h-4 w-4" /> Command Palette{" "}
                </Button>{" "}
              </div>{" "}
            </div>{" "}
          </header>{" "}
          <main
            className="projecto-scroll-container min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-10 lg:pb-20 lg:pt-8"
            data-route={location.pathname}
          >
            {" "}
            <div className="mx-auto w-full max-w-[1560px] space-y-6">
              {" "}
              <SubscriptionBanner
                onOpenBilling={() => {
                  navigate("/settings");
                }}
                onUpgrade={() => {
                  openUpgradeModal("projects");
                  navigate("/settings");
                }}
                subscription={subscription}
              />{" "}
              {children}{" "}
            </div>{" "}
          </main>{" "}
          <LogsPanel />{" "}
        </div>{" "}
        <UpdateOverlay />{" "}
      </div>{" "}
    </div>
  );
}
