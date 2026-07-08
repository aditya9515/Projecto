import { motion } from "framer-motion";
import type { BillingCycle } from "../../../main/types/shared";
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
  return (
    <div className="inline-flex rounded-full border border-line bg-panel p-1">
      {" "}
      {cycles.map((cycle) => {
        const active = value === cycle;
        return (
          <button
            className={cn(
              "relative rounded-full px-4 py-2 text-sm font-medium transition duration-150 ease-premium",
              active ? "text-bg" : "text-muted hover:text-text",
            )}
            key={cycle}
            onClick={() => onChange(cycle)}
            type="button"
          >
            {" "}
            {active ? (
              <motion.span
                className="absolute inset-0 rounded-full bg-text"
                layoutId="pricing-toggle"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}{" "}
            <span className="relative z-10">
              {cycle === "yearly" ? "Yearly" : "Monthly"}
            </span>{" "}
          </button>
        );
      })}{" "}
    </div>
  );
}
