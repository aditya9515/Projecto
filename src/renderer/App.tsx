import { Activity, WifiOff } from "lucide-react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { CommandPalette } from "./components/common/CommandPalette";
import { Button } from "./components/common/Button";
import { RouteErrorBoundary } from "./components/common/RouteErrorBoundary";
import { ToastRegion } from "./components/common/ToastRegion";
import { UpgradeModal } from "./components/common/UpgradeModal";
import { AppShell } from "./components/layout/AppShell";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { HomePage } from "./routes/HomePage";
import { HealthPage } from "./routes/HealthPage";
import { ImportPage } from "./routes/ImportPage";
import { ProjectDetailPage } from "./routes/ProjectDetailPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { SettingsPage } from "./routes/SettingsPage";
import { useAppStatusStore } from "./store/useAppStatusStore";
import { useProjectsStore } from "./store/useProjectsStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useSubscriptionStore } from "./store/useSubscriptionStore";
import { useToastStore } from "./store/useToastStore";
import { getFriendlyErrorMessage } from "./utils/errors";
import { MotionProvider } from "./motion/MotionProvider";
import { RouteTransition } from "./motion/RouteTransition";
export default function App(): JSX.Element {
  return (
    <MotionProvider>
      {typeof window.launchStack !== "undefined" ? (
        <AppContent />
      ) : (
        <ProjectoUnavailable />
      )}
    </MotionProvider>
  );
}
function AppContent(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const pushToast = useToastStore((state) => state.pushToast);
  const online = useAppStatusStore((state) => state.online);
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const settingsInitialized = useSettingsStore((state) => state.initialized);
  const projects = useProjectsStore((state) => state.projects);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const subscriptionLoading = useSubscriptionStore((state) => state.loading);
  const openUpgradePage = useSubscriptionStore(
    (state) => state.openUpgradePage,
  );
  const startGoogleSignIn = useSubscriptionStore(
    (state) => state.startGoogleSignIn,
  );
  const refreshSubscription = useSubscriptionStore(
    (state) => state.refreshSubscription,
  );
  const upgradeReason = useSubscriptionStore((state) => state.upgradeReason);
  const closeUpgradeModal = useSubscriptionStore(
    (state) => state.closeUpgradeModal,
  );
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  useAppBootstrap();
  if (!online) {
    return (
      <>
        <OfflineGate
          onRetry={async () => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              pushToast({
                title: "No network connection",
                description:
                  "Connect to the internet, then ask Projecto to reconnect.",
                tone: "error",
              });
              return;
            }
            try {
              await refreshSubscription();
              pushToast({
                title: "Connection restored",
                description:
                  "Projecto refreshed your desktop subscription state.",
                tone: "success",
              });
            } catch (error) {
              pushToast({
                title: "Still offline",
                description: getFriendlyErrorMessage(error, "Projecto could not reconnect yet."),
                tone: "error",
              });
            }
          }}
        />
        <ToastRegion />
      </>
    );
  }
  return (
    <>
      <AppShell>
        {" "}
        <RouteTransition key={location.pathname}>
            {" "}
            <RouteErrorBoundary>
              {" "}
              <Routes location={location}>
                {" "}
                <Route element={<HomePage />} path="/" />{" "}
                <Route element={<ImportPage />} path="/import" />{" "}
                <Route element={<ProjectsPage />} path="/projects" />{" "}
                <Route element={<ProjectDetailPage />} path="/projects/:id" />{" "}
                <Route element={<Navigate replace to="/settings" />} path="/account" />{" "}
                <Route element={<HealthPage />} path="/health" />{" "}
                <Route element={<Navigate replace to="/settings" />} path="/pricing" />{" "}
                <Route element={<SettingsPage />} path="/settings" />{" "}
                <Route element={<Navigate replace to="/" />} path="*" />{" "}
              </Routes>{" "}
            </RouteErrorBoundary>{" "}
        </RouteTransition>{" "}
      </AppShell>{" "}
      <CommandPalette />{" "}
      <UpgradeModal
        loading={subscriptionLoading}
        onOpenChange={(open) => {
          if (!open) {
            closeUpgradeModal();
          }
        }}
        onRefresh={async () => {
          try {
            await refreshSubscription();
          } catch (error) {
            pushToast({
              title: "Unable to refresh subscription",
              description: getFriendlyErrorMessage(error, "Projecto could not refresh your subscription."),
              tone: "error",
            });
          }
        }}
        onSignIn={async () => {
          try {
            await startGoogleSignIn();
          } catch (error) {
            pushToast({
              title: "Unable to start sign-in",
              description: getFriendlyErrorMessage(error, "Projecto could not start sign-in."),
              tone: "error",
            });
          }
        }}
        onUpgrade={async () => {
          try {
            await openUpgradePage();
          } catch (error) {
            pushToast({
              title: "Unable to open billing page",
              description: getFriendlyErrorMessage(error, "Projecto could not open the billing page."),
              tone: "error",
            });
          }
        }}
        open={upgradeReason !== null}
        reason={upgradeReason}
        subscription={subscription}
      />{" "}
      {settingsInitialized ? (
        <OnboardingWizard
          onComplete={async () => {
            await updateSettings({ hasCompletedOnboarding: true });
          }}
          onOpenImport={() => {
            navigate("/import");
          }}
          onOpenUpgrade={() => {
            openUpgradeModal("projects");
            navigate("/settings");
          }}
          onSkip={async () => {
            await updateSettings({ hasCompletedOnboarding: true });
          }}
          open={
            !settings.hasCompletedOnboarding && location.pathname !== "/import"
          }
          projectCount={projects.length}
        />
      ) : null}{" "}
      <ToastRegion />{" "}
    </>
  );
}
function OfflineGate({
  onRetry,
}: {
  onRetry: () => Promise<void>;
}): JSX.Element {
  return (
    <div className="app-shell-surface flex min-h-screen items-center justify-center bg-bg px-6">
      {" "}
      <div className="app-card-surface w-full max-w-xl rounded-[0.3rem] border border-line bg-panel p-8">
        {" "}
        <div className="app-icon-surface flex h-12 w-12 items-center justify-center rounded-[0.3rem] text-text">
          {" "}
          <WifiOff className="h-5 w-5" />{" "}
        </div>{" "}
        <div className="mt-5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent">
          No Network
        </div>{" "}
        <h2 className="app-page-title mt-2 text-text">
          Connect again to continue using Projecto.
        </h2>{" "}
        <p className="mt-3 text-sm leading-6 text-muted">
          {" "}
          Projecto needs a live connection to verify your account, sync
          project access, and keep launch permissions accurate. Your local
          project folders stay untouched while the app waits.{" "}
        </p>{" "}
        <div className="mt-6 flex flex-wrap gap-3">
          {" "}
          <Button onClick={() => void onRetry()} variant="primary">
            {" "}
            <Activity className="h-4 w-4" /> Connect Again{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
function ProjectoUnavailable(): JSX.Element {
  return (
    <div className="app-shell-surface flex h-screen items-center justify-center px-6">
      {" "}
      <div className="app-card-surface max-w-xl rounded-[0.3rem] border border-line bg-panel p-8">
        {" "}
        <div className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent">
          Projecto Desktop
        </div>{" "}
        <h1 className="app-page-title mt-3 text-text">
          Projecto needs the desktop runtime to continue.
        </h1>{" "}
        <p className="mt-4 text-sm leading-6 text-muted">
          {" "}
          The secure desktop API is not available in this window. Open Projecto
          from the installed desktop app so it can access local folders and launch commands safely.{" "}
        </p>{" "}
      </div>{" "}
    </div>
  );
}
