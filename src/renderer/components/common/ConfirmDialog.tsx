import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";
import { useState } from "react";
type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
};
export function ConfirmDialog({
  open,
  title,
  description,
  details = [],
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Dialog.Root onOpenChange={(value) => { if (!confirming) { setError(undefined); onOpenChange(value); } }} open={open}>
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
                  className="app-popup-surface w-[min(640px,calc(100vw-2rem))] rounded-[0.3rem] border border-line p-6"
                  exit={{ scale: 0.98, y: 10 }}
                  initial={{ scale: 0.96, y: 18 }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="app-icon-surface mt-0.5 flex h-11 w-11 items-center justify-center rounded-[0.3rem] text-text">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div className="space-y-2">
                        <Dialog.Title className="app-section-title text-2xl text-text">
                          {title}
                        </Dialog.Title>
                        <Dialog.Description className="text-sm leading-6 text-muted">
                          {description}
                        </Dialog.Description>
                      </div>
                    </div>
                    <Dialog.Close className="app-close-control rounded-lg p-2 transition">
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>
                  {details.length > 0 ? (
                    <div className="app-code-surface mt-5 rounded-xl border border-line p-4 font-mono text-xs">
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {details.map((detail) => (
                          <div
                            className="whitespace-pre-wrap break-words"
                            key={detail}
                          >
                            {detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-6 flex justify-end gap-3">
                    {error ? <p role="alert">{error}</p> : null}
                    <Button disabled={confirming} onClick={() => onOpenChange(false)} variant="ghost">
                      Cancel
                    </Button>
                    <Button
                      disabled={confirming}
                      onClick={async () => {
                        if (confirming) return;
                        setConfirming(true);
                        setError(undefined);
                        try { await onConfirm(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The operation failed."); }
                        finally { setConfirming(false); }
                      }}
                      variant={destructive ? "danger" : "primary"}
                    >
                      {confirming ? "Working…" : confirmLabel}
                    </Button>
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
