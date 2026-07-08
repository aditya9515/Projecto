import { create } from "zustand";
export type ToastTone = "info" | "success" | "error";
export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};
type ToastState = {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
};
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    }));
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));
