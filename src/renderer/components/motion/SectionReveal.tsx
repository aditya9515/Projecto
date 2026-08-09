import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../motion/gsapSetup";
import { motionDurations, motionEases } from "../../motion/motionTokens";
import { useMotionSettings } from "../../motion/MotionProvider";

export function SectionReveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotionSettings();

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reducedMotion) {
        return;
      }

      const scroller = root.closest<HTMLElement>(".projecto-scroll-container");
      gsap.fromTo(
        root,
        {
          clipPath: "inset(0 0 0 1.5%)",
          scale: 0.995,
          transformOrigin: "50% 50%",
        },
        {
          clipPath: "inset(0% 0 0% 0)",
          duration: motionDurations.reveal,
          ease: motionEases.reveal,
          scale: 1,
          scrollTrigger: {
            once: true,
            scroller: scroller ?? undefined,
            start: "top 92%",
            trigger: root,
          },
        },
      );
    },
    { dependencies: [reducedMotion], scope: rootRef },
  );

  return (
    <div className={`projecto-section-reveal ${className}`} ref={rootRef}>
      {children}
    </div>
  );
}
