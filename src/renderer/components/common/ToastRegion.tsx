import * as Toast from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { useToastStore } from "../../store/useToastStore";
const toneStyles = {
  info: "app-toast-surface border-line text-text",
  success: "app-toast-surface border-line text-text",
  error: "app-toast-surface border-danger text-text",
} as const;
const toneIcons = {
  info: <Info className="h-4 w-4 text-muted" />,
  success: <CheckCircle2 className="h-4 w-4 text-text" />,
  error: <CircleAlert className="h-4 w-4 text-text" />,
};
export function ToastRegion(): JSX.Element {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);
  return (
    <Toast.Provider swipeDirection="right">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast.Root
            asChild
            duration={4200}
            key={toast.id}
            onOpenChange={(open) => {
              if (!open) {
                dismissToast(toast.id);
              }
            }}
            open
          >
            <motion.div
              animate={{ x: 0, scale: 1 }}
              className={`relative mb-3 overflow-hidden rounded-[0.3rem] border px-4 py-3 ${toneStyles[toast.tone]}`}
              exit={{ x: 18, scale: 0.98 }}
              initial={{ x: 18, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex w-[360px] items-start gap-3">
                <div className="mt-0.5">{toneIcons[toast.tone]}</div>
                <div className="space-y-1">
                  <Toast.Title className="text-[0.68rem] font-bold uppercase tracking-[0.12em]">
                    {toast.title}
                  </Toast.Title>
                  {toast.description ? (
                    <Toast.Description className="text-sm text-muted">
                      {toast.description}
                    </Toast.Description>
                  ) : null}
                </div>
              </div>
              <motion.div
                animate={{ scaleX: 0 }}
                className="absolute inset-x-0 bottom-0 h-px bg-accent"
                initial={{ scaleX: 1 }}
                style={{ originX: 0 }}
                transition={{ duration: 4.2, ease: "linear" }}
              />
            </motion.div>
          </Toast.Root>
        ))}
      </AnimatePresence>
      <Toast.Viewport className="fixed right-5 top-5 z-[60] flex max-h-screen w-[380px] flex-col outline-none" />
    </Toast.Provider>
  );
}
