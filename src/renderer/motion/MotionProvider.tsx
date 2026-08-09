import { createContext, useContext, type ReactNode } from "react";
import { useReducedMotion } from "./useReducedMotion";

type MotionSettings = {
  reducedMotion: boolean;
};

const MotionSettingsContext = createContext<MotionSettings>({
  reducedMotion: false,
});

export function MotionProvider({ children }: { children: ReactNode }): JSX.Element {
  const reducedMotion = useReducedMotion();
  return (
    <MotionSettingsContext.Provider value={{ reducedMotion }}>
      {children}
    </MotionSettingsContext.Provider>
  );
}

export function useMotionSettings(): MotionSettings {
  return useContext(MotionSettingsContext);
}
