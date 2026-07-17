import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Command,
  Crown,
  FolderPlus,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import { useState } from "react";
import { AppIcon } from "../common/AppIcon";
import { Button } from "../common/Button";
import { PricingToggle } from "../common/PricingToggle";
type OnboardingWizardProps = {
  open: boolean;
  projectCount: number;
  onComplete: () => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  onOpenImport: () => void;
  onOpenUpgrade: () => void;
};
const steps = [
  {
    id: "welcome",
    title: "Welcome to Projecto",
    description:
      "Turn plain folders into launch-ready developer workspaces with detection, profiles, mirrored logs, and polished desktop control.",
    icon: <AppIcon className="h-5 w-5" />,
  },
  {
    id: "editor",
    title: "Use VS Code",
    description:
      "Projecto opens folders in VS Code and runs project commands in Windows Terminal.",
    icon: <SquareArrowOutUpRight className="h-5 w-5" />,
  },
  {
    id: "import",
    title: "Import your first project",
    description:
      "Bring in a folder, inspect the detected stack, and save a launch-ready project in under a minute.",
    icon: <FolderPlus className="h-5 w-5" />,
  },
  {
    id: "launch",
    title: "Use one-click launch",
    description:
      "Launch profiles let you open your editor, run commands, and open browser URLs from one polished workflow.",
    icon: <Command className="h-5 w-5" />,
  },
  {
    id: "upsell",
    title: "Upgrade when needed",
    description:
      "Plus unlocks unlimited projects, unlimited profiles, workspace presets, and bulk import.",
    icon: <Crown className="h-5 w-5" />,
  },
] as const;
export function OnboardingWizard({
  open,
  projectCount,
  onComplete,
  onSkip,
  onOpenImport,
  onOpenUpgrade,
}: OnboardingWizardProps): JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex] ?? steps[0];
  return (
    <Dialog.Root open={open}>
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
                  className="app-popup-surface w-[min(920px,calc(100vw-2rem))] overflow-hidden rounded-[34px] border border-line"
                  exit={{ scale: 0.98, y: 12 }}
                  initial={{ scale: 0.96, y: 18 }}
                  transition={{ type: "spring", stiffness: 280, damping: 28 }}
                >
                  <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="app-neutral-highlight border-b border-line p-6 lg:border-b-0 lg:border-r">
                      <div className="flex items-start justify-between gap-3">
                        <div className="app-icon-surface inline-flex h-12 w-12 items-center justify-center rounded-2xl text-text">
                          {currentStep.icon}
                        </div>
                        <button
                          className="app-close-control rounded-2xl p-2 transition"
                          onClick={() => void onSkip()}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-muted">
                        First launch
                      </div>
                      <div className="mt-3 text-3xl font-semibold tracking-tight text-text">
                        {currentStep.title}
                      </div>
                      <div className="mt-3 text-sm leading-6 text-muted">
                        {currentStep.description}
                      </div>
                      <div className="mt-8 space-y-2">
                        {steps.map((step, index) => (
                          <div
                            className="flex items-center gap-3"
                            key={step.id}
                          >
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${index <= stepIndex ? "app-control-selected" : "app-control-surface"}`}
                            >
                              {index < stepIndex ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            <div className="text-sm text-muted">
                              {step.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-6">
                      <AnimatePresence mode="wait">
                        <motion.div
                          animate={{ x: 0 }}
                          exit={{ x: -16 }}
                          initial={{ x: 16 }}
                          key={currentStep.id}
                          transition={{ duration: 0.22 }}
                        >
                          {currentStep.id === "welcome" ? (
                            <div className="space-y-6">
                              <div className="rounded-[28px] border border-line bg-panel p-5">
                                <div className="text-lg font-semibold text-text">
                                  What you can do right away
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  {[
                                    "Register local project folders",
                                    "Auto-detect stack and commands",
                                    "Create launch profiles",
                                    "Run workflows with mirrored logs",
                                  ].map((item) => (
                                    <div
                                      className="rounded-2xl border border-line bg-shell px-4 py-3 text-sm text-muted"
                                      key={item}
                                    >
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {currentStep.id === "editor" ? (
                            <div className="space-y-4">
                              <div className="rounded-[28px] border border-line bg-panel p-5">
                                <div className="text-base font-semibold text-text">
                                  VS Code
                                </div>
                                <div className="mt-2 text-sm leading-6 text-muted">
                                  Projecto uses the `code` command to open folders. Project commands run in Windows Terminal.
                                </div>
                                <div className="mt-4 rounded-2xl border border-line bg-shell px-4 py-3 text-sm text-muted">
                                  Current editor: VS Code
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {currentStep.id === "import" ? (
                            <div className="space-y-6">
                              <div className="rounded-[28px] border border-line bg-panel p-5">
                                <div className="text-base font-semibold text-text">
                                  Import flow
                                </div>
                                <div className="mt-4 space-y-3 text-sm text-muted">
                                  <div>1. Pick a local folder</div>
                                  <div>
                                    2. Review the detected stack and suggested
                                    commands
                                  </div>
                                  <div>3. Save it as a smart project</div>
                                </div>
                              </div>
                              <Button onClick={onOpenImport} variant="primary">
                                <FolderPlus className="h-4 w-4" />
                                {projectCount > 0
                                  ? "Import another project"
                                  : "Open import flow"}
                              </Button>
                            </div>
                          ) : null}
                          {currentStep.id === "launch" ? (
                            <div className="space-y-6">
                              <div className="rounded-[28px] border border-line bg-panel p-5">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <div className="text-base font-semibold text-text">
                                      One-click launch demo
                                    </div>
                                    <div className="mt-2 text-sm text-muted">
                                      Save editor opening, commands, and URLs
                                      into a single launch profile.
                                    </div>
                                  </div>
                                  <PricingToggle
                                    onChange={() => undefined}
                                    value="monthly"
                                  />
                                </div>
                                <div className="mt-4 rounded-[24px] border border-line bg-shell p-4">
                                  <div className="text-sm font-semibold text-text">
                                    Sample flow
                                  </div>
                                  <div className="mt-3 space-y-2 text-sm text-muted">
                                    <div>Open VS Code</div>
                                    <div>Run `npm run dev`</div>
                                    <div>Open `http://localhost:3000`</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {currentStep.id === "upsell" ? (
                            <div className="space-y-6">
                              <div className="app-neutral-highlight rounded-[28px] border border-line p-5">
                                <div className="text-lg font-semibold text-text">
                                  Projecto Plus
                                </div>
                                <div className="mt-2 text-sm text-muted">
                                  Unlimited projects, unlimited profiles,
                                  workspace presets, and bulk import when you
                                  need them.
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  {[
                                    "Unlimited projects",
                                    "Unlimited launch profiles",
                                    "Workspace presets",
                                    "Smart bulk import",
                                  ].map((item) => (
                                    <div
                                      className="rounded-2xl border border-line bg-shell px-4 py-3 text-sm text-muted"
                                      key={item}
                                    >
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                <Button
                                  onClick={onOpenUpgrade}
                                  variant="primary"
                                >
                                  <Crown className="h-4 w-4" /> Pricing
                                </Button>
                                <Button
                                  onClick={() => void onComplete()}
                                  variant="secondary"
                                >
                                  Finish setup
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </motion.div>
                      </AnimatePresence>
                      <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-5">
                        <button
                          className="text-sm text-muted transition hover:text-text"
                          onClick={() => void onSkip()}
                          type="button"
                        >
                          Skip for now
                        </button>
                        <div className="flex items-center gap-3">
                          {stepIndex > 0 ? (
                            <Button
                              onClick={() =>
                                setStepIndex((current) =>
                                  Math.max(0, current - 1),
                                )
                              }
                              variant="ghost"
                            >
                              Back
                            </Button>
                          ) : null}
                          {stepIndex < steps.length - 1 ? (
                            <Button
                              onClick={() =>
                                setStepIndex((current) =>
                                  Math.min(steps.length - 1, current + 1),
                                )
                              }
                              variant="primary"
                            >
                              Next <ArrowRight className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
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
