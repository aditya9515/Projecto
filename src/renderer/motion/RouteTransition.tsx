import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "./gsapSetup";
import { motionDurations, motionEases } from "./motionTokens";
import { useMotionSettings } from "./MotionProvider";

export function RouteTransition({ children }: { children: ReactNode }): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotionSettings();

  useGSAP(
    () => {
      if (reducedMotion || !container.current) return;
      gsap.fromTo(
        container.current,
        { clipPath: "inset(0 0 8% 0)", y: 22 },
        {
          clipPath: "inset(0 0 0% 0)",
          y: 0,
          duration: motionDurations.normal,
          ease: motionEases.interaction,
          clearProps: "clipPath,transform",
        },
      );
    },
    { dependencies: [reducedMotion], scope: container, revertOnUpdate: true },
  );

  return (
    <div className="projecto-route-transition" ref={container}>
      {children}
    </div>
  );
}
