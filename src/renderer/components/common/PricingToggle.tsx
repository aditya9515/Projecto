import { useRef } from "react";
import type { BillingCycle } from "../../../main/types/shared";
import { gsap, useGSAP } from "../../motion/gsapSetup";
import { motionDurations, motionEases } from "../../motion/motionTokens";
import { useMotionSettings } from "../../motion/MotionProvider";
import { cn } from "../../utils/cn";
type PricingToggleProps = {
  value: BillingCycle;
  onChange: (value: BillingCycle) => void;
};
const cycles: BillingCycle[] = ["monthly", "yearly"];
export function PricingToggle({
  value,
  onChange,
}: PricingToggleProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const { reducedMotion } = useMotionSettings();

  useGSAP(
    () => {
      if (!indicator.current) return;
      gsap.to(indicator.current, {
        xPercent: value === "yearly" ? 100 : 0,
        duration: reducedMotion ? 0 : motionDurations.fast,
        ease: motionEases.tactile,
      });
    },
    { dependencies: [reducedMotion, value], scope: root, revertOnUpdate: true },
  );

  return (
    <div
      className="projecto-pricing-toggle relative inline-grid grid-cols-2 border border-line bg-panel p-1"
      data-cycle={value}
      ref={root}
    >
      <span aria-hidden="true" className="projecto-pricing-indicator" ref={indicator} />
      {" "}
      {cycles.map((cycle) => {
        const active = value === cycle;
        return (
          <button
            className={cn(
              "relative z-10 rounded-[2px] px-4 py-2 text-sm font-medium transition duration-150 ease-premium",
              active ? "text-text" : "text-muted hover:text-text",
            )}
            key={cycle}
            onClick={() => onChange(cycle)}
            type="button"
          >
            <span>
              {cycle === "yearly" ? "Yearly" : "Monthly"}
            </span>{" "}
          </button>
        );
      })}{" "}
    </div>
  );
}
