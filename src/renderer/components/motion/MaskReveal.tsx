import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "../../motion/gsapSetup";
import { motionDurations, motionEases } from "../../motion/motionTokens";
import { useMotionSettings } from "../../motion/MotionProvider";
import { cn } from "../../utils/cn";

export function MaskReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}): JSX.Element {
  const mask = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotionSettings();

  useGSAP(
    () => {
      if (reducedMotion || !content.current) return;
      gsap.fromTo(
        content.current,
        { yPercent: 28 },
        {
          yPercent: 0,
          duration: motionDurations.reveal,
          delay,
          ease: motionEases.reveal,
          clearProps: "transform",
        },
      );
    },
    { dependencies: [delay, reducedMotion], scope: mask, revertOnUpdate: true },
  );

  return (
    <div className={cn("projecto-mask-reveal", className)} ref={mask}>
      <div ref={content}>{children}</div>
    </div>
  );
}
